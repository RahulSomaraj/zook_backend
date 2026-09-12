import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
  path: string;
}

/**
 * Wraps every successful controller return value in a consistent JSON envelope.
 *
 * If a handler returns `{ data, meta }`, `meta` is lifted to the top level
 * (used for pagination). Otherwise the whole return value becomes `data`.
 *
 * A `StreamableFile` (binary download such as a shipping label) is passed
 * through untouched: Nest only streams it when it is the raw return value, so
 * wrapping it would serialize the stream object as JSON instead of the file.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | StreamableFile
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | StreamableFile> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((payload: unknown): ApiResponse<T> | StreamableFile => {
        if (payload instanceof StreamableFile) return payload;

        const envelope =
          payload !== null &&
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload
            ? (payload as { data: T; meta: Record<string, unknown> })
            : null;

        return {
          success: true,
          data: envelope ? envelope.data : (payload as T),
          ...(envelope ? { meta: envelope.meta } : {}),
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
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
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((payload): ApiResponse<T> => {
        const hasMeta =
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload;

        return {
          success: true,
          data: hasMeta ? payload.data : (payload as T),
          ...(hasMeta ? { meta: payload.meta } : {}),
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }
}

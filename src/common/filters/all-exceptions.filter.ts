import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

/**
 * Global exception handler. Produces a consistent error envelope for every
 * thrown error, maps known Prisma errors to sensible HTTP codes, and logs
 * 5xx failures with stack traces while keeping 4xx quiet.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        message = (res as any).message ?? exception.message;
        error = (res as any).error ?? exception.name;
      }
    } else if (this.isPrismaKnownError(exception)) {
      ({ statusCode, message, error } = this.mapPrismaError(exception));
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const body: ErrorBody = {
      success: false,
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${statusCode}`);
    }

    response.status(statusCode).json(body);
  }

  private isPrismaKnownError(
    e: unknown,
  ): e is { code: string; meta?: Record<string, unknown> } {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      typeof (e as any).code === 'string' &&
      (e as any).code.startsWith('P')
    );
  }

  private mapPrismaError(e: { code: string; meta?: Record<string, unknown> }): {
    statusCode: number;
    message: string;
    error: string;
  } {
    switch (e.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Unique constraint failed${
            e.meta?.target ? ` on ${String(e.meta.target)}` : ''
          }`,
          error: 'Conflict',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'NotFound',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          error: 'BadRequest',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'DatabaseError',
        };
    }
  }
}

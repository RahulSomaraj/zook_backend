import { ConsoleLogger, Injectable, LogLevel, Scope } from '@nestjs/common';

const LEVEL_PRIORITY: Record<string, number> = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
  verbose: 4,
};

/**
 * Environment-driven logger.
 *
 * - LOG_LEVEL controls verbosity (error < warn < log < debug < verbose).
 * - LOG_FORMAT=json emits structured single-line JSON (for prod log shippers);
 *   anything else falls back to Nest's pretty console output (for local dev).
 *
 * Read directly from process.env so it is usable during bootstrap, before the
 * DI container / ConfigService is available.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  private readonly threshold = LEVEL_PRIORITY[process.env.LOG_LEVEL ?? 'log'] ?? 2;
  private readonly asJson = (process.env.LOG_FORMAT ?? 'pretty') === 'json';

  private enabled(level: LogLevel): boolean {
    return (LEVEL_PRIORITY[level] ?? 2) <= this.threshold;
  }

  private emit(level: LogLevel, message: unknown, context?: string, trace?: string) {
    if (!this.enabled(level)) return;

    if (this.asJson) {
      const line = {
        timestamp: new Date().toISOString(),
        level,
        context: context ?? this.context,
        message:
          typeof message === 'string' ? message : JSON.stringify(message),
        ...(trace ? { trace } : {}),
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(line));
      return;
    }

    // Pretty mode: delegate to Nest's coloured console logger.
    switch (level) {
      case 'error':
        super.error(message as string, trace, context);
        break;
      case 'warn':
        super.warn(message as string, context);
        break;
      case 'debug':
        super.debug(message as string, context);
        break;
      case 'verbose':
        super.verbose(message as string, context);
        break;
      default:
        super.log(message as string, context);
    }
  }

  log(message: unknown, context?: string) {
    this.emit('log', message, context);
  }
  error(message: unknown, trace?: string, context?: string) {
    this.emit('error', message, context, trace);
  }
  warn(message: unknown, context?: string) {
    this.emit('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.emit('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.emit('verbose', message, context);
  }
}

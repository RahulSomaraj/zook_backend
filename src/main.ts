import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppLogger } from './common/logger/app-logger.service';

const log = new Logger('Bootstrap');

// ─────────────────────────────────────────────────────────────────────────────
// Process-level safety nets
// An unhandled rejection or uncaught exception would otherwise crash the
// process; we log it and keep serving. Registered at module load so they cover
// failures during bootstrap too.
// ─────────────────────────────────────────────────────────────────────────────
function installProcessSafetyNets(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    console.error(
      '[unhandledRejection]',
      reason instanceof Error ? reason.stack : reason,
    );
  });
  process.on('uncaughtException', (err: Error) => {
    console.error('[uncaughtException]', err.stack ?? err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Security, compression & request hardening
// ─────────────────────────────────────────────────────────────────────────────
function configureMiddleware(app: INestApplication): void {
  // Response compression for payloads above 1KB.
  app.use(compression({ threshold: 1024 }));

  // Security response headers. CSP is left off by default so it doesn't block
  // the Swagger UI; enable a tailored CSP once the served surface is known.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Cap request bodies to mitigate payload-based DoS.
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.use(stripEmptyQueryParams);
}

// Browsers and Swagger UI send `?sort=&category_id=` for untouched or cleared
// optional filters. With the global ValidationPipe's `enableImplicitConversion`,
// an empty string reaches a number field as `Number('') === 0` and a uuid/enum
// field as `''`, so a blank filter 400s the whole request instead of being
// ignored. Deleting empty-string query values here — before validation — makes
// a blank filter mean "absent", uniformly across every endpoint, so defaults
// and `IsOptional` apply naturally. Genuinely unknown keys are still rejected
// by `forbidNonWhitelisted`.
function stripEmptyQueryParams(
  req: { query: Record<string, unknown> },
  _res: unknown,
  next: () => void,
): void {
  const q = req.query;
  for (const key of Object.keys(q)) {
    if (q[key] === '') delete q[key];
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS — explicit allowlist from env, with dev fallbacks
// ─────────────────────────────────────────────────────────────────────────────
function configureCors(app: INestApplication, config: ConfigService): string[] {
  const isProd = config.get<string>('app.env') === 'production';
  const configuredOrigins = config.get<string[]>('cors.origins') ?? [];
  const allowedOrigins = isProd
    ? configuredOrigins
    : [
        ...configuredOrigins,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
      ];

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  return allowedOrigins;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global validation, response envelope & error handling
// ─────────────────────────────────────────────────────────────────────────────
function configureGlobals(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}

// ─────────────────────────────────────────────────────────────────────────────
// Swagger / OpenAPI docs — returns the mount path when enabled, else null
// ─────────────────────────────────────────────────────────────────────────────
function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): string | null {
  if (!config.get<boolean>('swagger.enabled')) return null;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zook API')
    .setDescription('Zook — UAE secondhand goods marketplace backend')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'phone-verify-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const path = config.get<string>('swagger.path') ?? 'docs';
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown — let Nest run onModuleDestroy hooks (e.g. Prisma disconnect)
// so in-flight work and the DB connection close cleanly.
// ─────────────────────────────────────────────────────────────────────────────
function configureShutdown(app: INestApplication): void {
  app.enableShutdownHooks();

  const shutdown = (signal: string): void => {
    log.warn(`${signal} received — closing application…`);
    app
      .close()
      .then(() => {
        log.log('Application closed cleanly. Goodbye 👋');
        process.exit(0);
      })
      .catch((err) => {
        log.error(
          'Error during shutdown',
          err instanceof Error ? err.stack : err,
        );
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup banner — a concise summary of how the app came up.
// ─────────────────────────────────────────────────────────────────────────────
function logStartup(opts: {
  env: string;
  port: number;
  globalPrefix: string;
  swaggerPath: string | null;
  corsOrigins: string[];
}): void {
  const { env, port, globalPrefix, swaggerPath, corsOrigins } = opts;
  const base = `http://localhost:${port}`;

  log.log('───────────────────────────────────────────────');
  log.log(`🚀 Zook backend is up`);
  log.log(`   Environment : ${env}`);
  log.log(`   API base    : ${base}/${globalPrefix}`);
  log.log(
    swaggerPath
      ? `   Swagger docs: ${base}/${swaggerPath}`
      : `   Swagger docs: disabled`,
  );
  log.log(
    `   CORS origins: ${corsOrigins.length ? corsOrigins.join(', ') : '(none — blocked)'}`,
  );
  log.log('───────────────────────────────────────────────');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  installProcessSafetyNets();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Env-driven logger replaces the default console logger. AppLogger is
  // transient-scoped, so it must be resolved (async) rather than fetched via get().
  app.useLogger(await app.resolve(AppLogger));

  const config = app.get(ConfigService);
  const env = config.get<string>('app.env') ?? 'development';
  const port = config.get<number>('app.port') ?? 3000;
  const globalPrefix = 'api';

  app.setGlobalPrefix(globalPrefix);
  configureMiddleware(app);
  const corsOrigins = configureCors(app, config);
  configureGlobals(app);
  const swaggerPath = setupSwagger(app, config);
  configureShutdown(app);

  await app.listen(port);

  logStartup({ env, port, globalPrefix, swaggerPath, corsOrigins });
}

void bootstrap().catch((err) => {
  log.error(
    'Fatal error during bootstrap',
    err instanceof Error ? err.stack : err,
  );
  process.exit(1);
});

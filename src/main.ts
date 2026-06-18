import { ValidationPipe } from '@nestjs/common';
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

// Process-level safety nets. An unhandled rejection or uncaught exception would
// otherwise crash the process; we log it and keep serving. Registered at module
// load so they cover failures during bootstrap too.
process.on('unhandledRejection', (reason: unknown) => {
  console.error(
    '[unhandledRejection]',
    reason instanceof Error ? reason.stack : reason,
  );
});

process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException]', err.stack ?? err);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Env-driven logger replaces the default console logger.
  app.useLogger(app.get(AppLogger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Response compression for payloads above 1KB.
  app.use(compression({ threshold: 1024 }));

  // Security response headers. CSP is left off by default so it doesn't block
  // the Swagger UI; enable a tailored CSP once the served surface is known.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Cap request bodies to mitigate payload-based DoS.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // CORS: explicit allowlist from env. In development, fall back to common
  // local dev origins so the portals work out of the box.
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

  if (config.get<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Zook API')
      .setDescription('Zook — UAE secondhand goods marketplace backend')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(
      config.get<string>('swagger.path') ?? 'docs',
      app,
      document,
      { swaggerOptions: { persistAuthorization: true } },
    );
  }

  // Let Nest run onModuleDestroy hooks (e.g. PrismaService.$disconnect) when
  // the process is asked to stop, so in-flight work and the DB connection close
  // cleanly instead of being killed mid-flight.
  app.enableShutdownHooks();

  const shutdown = (signal: string): void => {
    console.log(`[shutdown] ${signal} received — closing app`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[shutdown] error during close', err);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
void bootstrap();

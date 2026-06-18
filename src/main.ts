import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Env-driven logger replaces the default console logger.
  app.useLogger(app.get(AppLogger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

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

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
void bootstrap();

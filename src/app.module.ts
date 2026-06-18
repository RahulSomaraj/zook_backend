import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './database/prisma.module';
import { ProductsModule } from './products/products.module';
import { VendorsModule } from './vendors/vendors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    LoggerModule,
    PrismaModule,
    AuthModule,
    VendorsModule,
    AdminModule,
    CatalogModule,
    ProductsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global auth: every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC: enforces @Roles() metadata. Runs after JwtAuthGuard.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

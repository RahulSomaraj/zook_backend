import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { OtpModule } from './otp/otp.module';
import { VendorsModule } from './vendors/vendors.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CatalogModule } from './catalog/catalog.module';
import { CustomerAuthModule } from './customers/customer-auth/customer-auth.module';
import { CategoriesModule } from './customers/customer-categories/categories.module';
import { CartModule } from './customers/cart/cart.module';
import { OrdersModule } from './customers/orders/orders.module';
import { AdressesModule } from './customers/adresses/adresses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
      }),
    }),
    // In-process pub/sub used to decouple approval actions from notification
    // delivery (OnboardingNotifier listens for `onboarding.step_changed`).
    EventEmitterModule.forRoot(),
    LoggerModule,
    PrismaModule,
    StorageModule,
    OtpModule,
    AuthModule,
    VendorsModule,
    AdminModule,
    RealtimeModule,
    CatalogModule,
    CustomerAuthModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    AdressesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiting - throttles request floods per client IP.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

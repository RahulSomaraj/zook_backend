import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorAuthService } from './vendor-auth.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { PhoneVerifyGuard } from './guards/phone-verify.guard';
import { ListingsController } from './listings/listings.controller';
import { ListingsService } from './listings/listings.service';
import { VendorOrdersController } from './orders/vendor-orders.controller';
import { VendorOrdersService } from './orders/vendor-orders.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';

@Module({
  imports: [AuthModule, OtpModule],
  controllers: [
    VendorAuthController,
    VendorsController,
    ListingsController,
    VendorOrdersController,
    SettingsController,
  ],
  providers: [
    VendorAuthService,
    VendorsService,
    PhoneVerifyGuard,
    ListingsService,
    VendorOrdersService,
    SettingsService,
  ],
})
export class VendorsModule {}
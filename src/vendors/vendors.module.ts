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

@Module({
  imports: [AuthModule, OtpModule],
  controllers: [VendorAuthController, VendorsController, ListingsController],
  providers: [VendorAuthService, VendorsService, PhoneVerifyGuard, ListingsService],
})
export class VendorsModule {}
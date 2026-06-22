import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorAuthService } from './vendor-auth.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { PhoneVerifyGuard } from './guards/phone-verify.guard';

@Module({
  imports: [AuthModule, OtpModule],
  controllers: [VendorAuthController, VendorsController],
  providers: [VendorAuthService, VendorsService, PhoneVerifyGuard],
})
export class VendorsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { OtpModule } from '../../otp/otp.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';

@Module({
  imports: [AuthModule, OtpModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
})
export class CustomerAuthModule {}

import { Module } from '@nestjs/common';
import { OtpRateLimiterService } from './otp-rate-limiter.service';
import { OtpService } from './otp.service';
import { LocalOtpProvider } from './providers/local-otp.provider';
import { TwilioVerifyProvider } from './providers/twilio-verify.provider';

/**
 * Relies on PrismaModule, RedisModule and ConfigModule being global. Both OTP
 * providers are always instantiated; OtpService selects between them per
 * purpose at call time based on config.
 */
@Module({
  providers: [
    OtpService,
    OtpRateLimiterService,
    LocalOtpProvider,
    TwilioVerifyProvider,
  ],
  exports: [OtpService],
})
export class OtpModule {}

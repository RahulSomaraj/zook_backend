import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthTokensDto } from '../../auth/dto/auth-tokens.dto';
import { SocialLoginDto } from '../../auth/social/dto/social-login.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RequestOtpDto } from './dto/otpRequestDto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  CustomerAuthService,
  RequestOtpResult,
  VerifyOtpResult,
} from './customer-auth.service';

@ApiTags('customer-auth')
@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly customerAuth: CustomerAuthService) {}

  @Post('register')
  @HttpCode(201)
  // Tighter than the global limit: registration is a spam/abuse target.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary:
      'Register a customer with full name, email and phone (dial code + number as separate fields). Returns session tokens.',
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiConflictResponse({ description: 'Email or phone already registered' })
  register(@Body() dto: RegisterCustomerDto): Promise<AuthTokensDto> {
    return this.customerAuth.register(dto);
  }

  @Post('otp/send')
  @HttpCode(200)
  // Edge guard against SMS pumping / toll fraud (per client IP). The per-phone
  // cooldown + daily cap in OtpService is the primary control; this backstops
  // IP-level floods before they fan out across many numbers.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: 'Send a customer login/signup OTP to a phone number',
  })
  requestOtp(@Body() dto: RequestOtpDto): Promise<RequestOtpResult> {
    return this.customerAuth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  // Brute-force guard on code submission (per client IP), on top of Twilio's
  // own per-verification attempt cap.
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({
    summary:
      'Verify a customer OTP. Returns session tokens and auto-creates the customer account on first login.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired code' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResult> {
    return this.customerAuth.verifyOtp(dto.phone, dto.code);
  }

  @Post('social/google')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Sign in / sign up a customer with Google via Supabase. Auto-creates the account on first login; phone is verified later at checkout.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired social token' })
  socialGoogle(@Body() dto: SocialLoginDto) {
    return this.customerAuth.socialGoogle(dto.supabaseAccessToken);
  }
}

import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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

  @Post('phone/send')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary:
      'Send an OTP to attach/verify a phone on the CURRENT authenticated user (e.g. after Google signup, before checkout).',
  })
  @ApiConflictResponse({ description: 'Phone already linked to another account' })
  requestPhoneAttach(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestOtpDto,
  ): Promise<RequestOtpResult> {
    return this.customerAuth.requestPhoneAttachOtp(user.id, dto.phone);
  }

  @Post('phone/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({
    summary:
      'Verify the attach OTP and set phone + phoneVerified on the current user. Never creates or switches accounts.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired code' })
  @ApiConflictResponse({ description: 'Phone already linked to another account' })
  verifyPhoneAttach(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyOtpDto,
  ): Promise<{ phone: string; phoneVerified: true }> {
    return this.customerAuth.verifyPhoneAttach(user.id, dto.phone, dto.code);
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

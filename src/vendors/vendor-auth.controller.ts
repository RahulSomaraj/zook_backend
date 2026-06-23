import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthTokensDto } from '../auth/dto/auth-tokens.dto';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  RequestOtpResult,
  VendorAuthService,
  VerifyOtpResult,
} from './vendor-auth.service';

@ApiTags('vendor-auth')
@Controller('auth/vendor')
export class VendorAuthController {
  constructor(private readonly vendorAuth: VendorAuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a login/signup OTP to a phone number' })
  requestOtp(@Body() dto: RequestOtpDto): Promise<RequestOtpResult> {
    return this.vendorAuth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verify an OTP. Returns session tokens for existing vendors, or a verificationToken for new signups.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired code' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResult> {
    return this.vendorAuth.verifyOtp(dto.phone, dto.code);
  }

  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a vendor account (vendor create page, KYC step 1).',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  register(@Body() dto: RegisterVendorDto): Promise<AuthTokensDto> {
    return this.vendorAuth.register(dto);
  }
}

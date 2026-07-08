import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
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

  @Post('otp/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a customer login/signup OTP to a phone number' })
  requestOtp(@Body() dto: RequestOtpDto): Promise<RequestOtpResult> {
    return this.customerAuth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verify a customer OTP. Returns session tokens and auto-creates the customer account on first login.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired code' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResult> {
    return this.customerAuth.verifyOtp(dto.phone, dto.code);
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SignupCustomerDto } from './signup-customer.dto';

/**
 * Vendor self-signup (POST /auth/signup/vendor).
 *
 * Creates the account with the `vendor` role. The store profile + KYC documents
 * are submitted separately via POST /vendors/apply once the account exists.
 * `storeName` is optional here purely as a convenience hint for onboarding.
 */
export class SignupVendorDto extends SignupCustomerDto {
  @ApiPropertyOptional({
    example: 'Falcon Electronics',
    description:
      'Optional. The full store profile + KYC is submitted via /vendors/apply.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName?: string;
}

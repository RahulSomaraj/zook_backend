import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitKycDto {
  @ApiPropertyOptional({ example: 'CN-1234567' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  tradeLicenseNumber?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Trade license expiry (ISO date).',
  })
  @IsOptional()
  @IsDateString()
  tradeLicenseExpiry?: string;

  @ApiProperty({
    description: 'URL from /vendors/me/kyc/documents (kind=trade_license).',
  })
  @IsString()
  tradeLicenseUrl!: string;

  @ApiProperty({ description: 'URL from upload (kind=emirates_id_front).' })
  @IsString()
  emiratesIdFrontUrl!: string;

  @ApiProperty({ description: 'URL from upload (kind=emirates_id_back).' })
  @IsString()
  emiratesIdBackUrl!: string;
}

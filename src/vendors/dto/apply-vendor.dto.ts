import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Vendor onboarding + KYC submission (POST /vendors/apply).
 * Document URLs reference files already uploaded to the private Supabase bucket.
 */
export class ApplyVendorDto {
  @ApiProperty({ example: 'Falcon Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  storeLogoUrl?: string;

  @ApiPropertyOptional({ description: 'Used for courier pickup only' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  storeAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  pickupLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  pickupLng?: number;

  // ── KYC documents ──
  @ApiProperty({ description: 'Private bucket URL' })
  @IsUrl()
  tradeLicenseUrl!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  tradeLicenseNumber!: string;

  @ApiProperty({ example: '2027-12-31' })
  @IsDateString()
  tradeLicenseExpiry!: string;

  @ApiProperty({ description: 'Private bucket URL' })
  @IsUrl()
  emiratesIdFrontUrl!: string;

  @ApiProperty({ description: 'Private bucket URL' })
  @IsUrl()
  emiratesIdBackUrl!: string;
}

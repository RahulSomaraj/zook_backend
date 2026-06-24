import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Admin-initiated vendor creation. Provisions the underlying user account, the
 * vendor role grant and the vendor record. The vendor can later sign in via OTP
 * using the phone supplied here.
 */
export class CreateVendorDto {
  @ApiProperty({ example: 'Al Turath Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName!: string;

  @ApiProperty({ example: 'Ahmed Al Turath', description: 'Owner full name.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerFullName!: string;

  @ApiProperty({ example: 'store@alturath.ae' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    example: '+971501234567',
    description: 'Mobile number; UAE default if no country code.',
  })
  @IsString()
  @Matches(/^[+]?[0-9\s()\-.]{6,20}$/, { message: 'Invalid phone number' })
  phone!: string;

  @ApiPropertyOptional({ description: 'Courier pickup address.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storeAddress?: string;

  @ApiPropertyOptional({ description: 'Commission percentage (0–100).', minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @ApiPropertyOptional({
    enum: VendorStatus,
    description: 'Initial status. Defaults to pending.',
    default: VendorStatus.pending,
  })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;
}

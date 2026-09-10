import { ApiPropertyOptional } from '@nestjs/swagger';
import { Emirate } from '@prisma/client';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateVendorProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Public store contact number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeAddress?: string;

  @ApiPropertyOptional({ description: 'Pickup area / locality' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({
    example: '4',
    description:
      'Shop, unit or house number at the pickup address. Required by the courier before a shipment can be created.',
  })
  @IsOptional()
  @IsString()
  houseNo?: string;

  @ApiPropertyOptional({
    example: 'Opposite Al Khail Mall',
    description:
      'Nearby landmark for the pickup address. Required by the courier before a shipment can be created.',
  })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiPropertyOptional({ enum: Emirate })
  @IsOptional()
  @IsEnum(Emirate)
  emirate?: Emirate;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pickupLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pickupLng?: number;

  @ApiPropertyOptional({ description: 'Owner full name (updates the linked user)' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Owner email (updates the linked user)' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
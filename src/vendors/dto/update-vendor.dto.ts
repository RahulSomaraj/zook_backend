import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Editable vendor profile fields (PATCH /vendors/profile). */
export class UpdateVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  storeLogoUrl?: string;

  @ApiPropertyOptional()
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
}

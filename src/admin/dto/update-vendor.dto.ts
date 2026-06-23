import { ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin-editable vendor fields. All optional — only provided keys are updated
 * (PATCH semantics). `status` doubles as approve/suspend.
 */
export class UpdateVendorDto {
  @ApiPropertyOptional({ example: 'Acme Trading LLC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storeName?: string;

  @ApiPropertyOptional({ description: 'Courier pickup address.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storeAddress?: string;

  @ApiPropertyOptional({ description: 'Public store logo URL.' })
  @IsOptional()
  @IsUrl()
  storeLogoUrl?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLat?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLng?: number;

  @ApiPropertyOptional({ description: 'Commission percentage (0–100).', minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @ApiPropertyOptional({ enum: VendorStatus, description: 'Approve / suspend the store.' })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional({ minimum: 0, description: 'Moderation strike count.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  strikeCount?: number;
}

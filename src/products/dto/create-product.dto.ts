import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConditionGrade } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator';

/**
 * Vendor product creation. The product is linked to a master catalog entry;
 * `source` and `vendorId` are set server-side from the authenticated vendor.
 */
export class CreateProductDto {
  @ApiProperty({ description: 'Master catalog entry id' })
  @IsUUID()
  catalogId!: string;

  @ApiProperty({ enum: ConditionGrade })
  @IsEnum(ConditionGrade)
  conditionGrade!: ConditionGrade;

  @ApiPropertyOptional({ example: '128GB' })
  @IsOptional()
  @IsString()
  storageVariant?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ type: [String], description: 'Inspection image URLs' })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  inspectionImages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  whatIsIncluded?: Record<string, unknown>;

  @ApiProperty({ example: 850 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQty?: number;
}

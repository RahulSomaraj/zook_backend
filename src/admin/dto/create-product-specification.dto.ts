import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Admin-creates a single specification row for a catalog entry. `label` is
 * unique per catalog (attempting a duplicate returns 409), so a given attribute
 * has exactly one value.
 */
export class CreateProductSpecificationDto {
  @ApiProperty({ example: 'Chipset', description: 'Attribute name.' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ example: 'A16 Bionic', description: 'Attribute value.' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(500)
  value!: string;

  @ApiPropertyOptional({
    example: 'Performance',
    description: 'Optional section grouping for display.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  group?: string;

  @ApiPropertyOptional({
    description: 'Sort order within the catalog entry (asc).',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

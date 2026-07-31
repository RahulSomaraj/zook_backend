import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Admin-creates a single specification row for a catalog entry.
 *
 * Prefer `specId`: it names one of the fields defined for the catalog entry's
 * category, and the label is then copied from that definition rather than
 * retyped. `label` stays accepted for one-off attributes the category does not
 * define — supply exactly one of the two. Both are unique per catalog entry, so
 * an attribute has a single value (a duplicate returns 409).
 */
export class CreateProductSpecificationDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Category specification being answered. Must belong to this catalog entry's category. Supply this or `label`, not both.",
  })
  @IsOptional()
  @IsUUID()
  specId?: string;

  @ApiPropertyOptional({
    example: 'Chipset',
    description:
      'Attribute name, for a one-off spec the category does not define.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(120)
  label?: string;

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
    type: Number,
    minimum: 0,
    description:
      "Sort order within the catalog entry (asc). Defaults to the definition's own order when `specId` is given, otherwise 0.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

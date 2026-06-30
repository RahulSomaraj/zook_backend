import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Structured variant + spec payload stored in `ProductCatalog.specs` (JSON).
 * Each list is optional; what is supplied replaces the stored value wholesale
 * on update (no per-item merge). Mirrors the chip groups on the admin page:
 * storage options, colour options and buyer-facing key specifications.
 */
export class CatalogSpecsDto {
  @ApiPropertyOptional({
    description: 'Storage options, e.g. ["128GB","256GB"].',
    type: [String],
    example: ['128GB', '256GB', '512GB', '1TB'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  storage?: string[];

  @ApiPropertyOptional({
    description: 'Colour options, e.g. ["Space Black","Silver"].',
    type: [String],
    example: ['Deep Purple', 'Gold', 'Silver', 'Space Black'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  colors?: string[];

  @ApiPropertyOptional({
    description: 'Key specifications shown to buyers.',
    type: [String],
    example: ['A16 Bionic', '6.1" ProMotion', '48MP camera'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  keySpecs?: string[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ConditionGrade, ProductSource } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Supported sort orders for the buyer product list. */
export enum ProductSort {
  /** Newest first — replaces the old /recently-listed endpoint. Default. */
  RECENT = 'recent',
  OLDEST = 'oldest',
  PRICE_LOW = 'price_low',
  PRICE_HIGH = 'price_high',
  /** Curation heuristic (premium-first) — replaces the old /top-picks endpoint. */
  TOP_PICKS = 'top_picks',
}

/**
 * Query for the unified buyer product list. Combines the former list,
 * recently-listed and top-picks endpoints: pick the list via `sort`, narrow it
 * with the filters, and page through with `page`/`limit`.
 *
 * Property names intentionally match the public query keys (snake_case) so they
 * bind directly under the global ValidationPipe (whitelist + forbidNonWhitelisted).
 */
export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ProductSort,
    default: ProductSort.RECENT,
    description: 'Sort order. Defaults to newest first.',
  })
  @IsOptional()
  @IsEnum(ProductSort)
  sort: ProductSort = ProductSort.RECENT;

  @ApiPropertyOptional({ description: 'Filter by category id (uuid).' })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @ApiPropertyOptional({ description: 'Filter by country ISO2 code, e.g. AE.' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by brand id (uuid).' })
  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @ApiPropertyOptional({ description: 'Filter by vendor id (uuid).' })
  @IsOptional()
  @IsUUID()
  vendor_id?: string;

  @ApiPropertyOptional({
    enum: ProductSource,
    description: 'Filter by source: vendor or c2c.',
  })
  @IsOptional()
  @IsEnum(ProductSource)
  source?: ProductSource;

  @ApiPropertyOptional({
    enum: ConditionGrade,
    description: 'Filter by condition grade.',
  })
  @IsOptional()
  @IsEnum(ConditionGrade)
  condition?: ConditionGrade;

  @ApiPropertyOptional({ description: 'Filter by storage variant, e.g. 256GB.' })
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ description: 'Filter by color.' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Filter by catalog year.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum price (inclusive).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_price?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Maximum price (inclusive).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_price?: number;

  @ApiPropertyOptional({
    description: 'Free-text search across brand name and model.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

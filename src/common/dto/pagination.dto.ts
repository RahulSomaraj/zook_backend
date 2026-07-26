import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  // `type: Number` is explicit because the Swagger CLI plugin is not enabled;
  // without it the generated spec types this as `Object`, and Swagger UI then
  // renders a JSON box instead of a number field and sends a malformed value.
  // Empty-string query values are stripped globally before validation (see
  // stripEmptyQueryParams in main.ts), so a blank field falls back to the
  // default below rather than coercing to 0.
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

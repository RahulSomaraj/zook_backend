import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { EmptyToUndefined } from './empty-to-undefined.decorator';

export class PaginationQueryDto {
  // `type: Number` is explicit because the Swagger CLI plugin is not enabled;
  // without it the generated spec types this as `Object`, and Swagger UI then
  // renders a JSON box instead of a number field and sends a malformed value.
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @EmptyToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @EmptyToUndefined()
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

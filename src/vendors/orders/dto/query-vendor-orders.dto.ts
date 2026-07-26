import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Status filter values: `all` plus every OrderStatus fulfillment state. */
export const VENDOR_ORDER_STATUS_FILTERS = [
  'all',
  ...Object.values(OrderStatus),
] as const;

export type VendorOrderStatusFilter =
  (typeof VENDOR_ORDER_STATUS_FILTERS)[number];

export class QueryVendorOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VENDOR_ORDER_STATUS_FILTERS,
    description:
      'Filter by fulfillment state. `all` (or omitted) returns every sub-order; ' +
      'otherwise one of: confirmed, preparing, ready, shipped, delivered, cancelled.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(VENDOR_ORDER_STATUS_FILTERS)
  status?: VendorOrderStatusFilter;

  @ApiPropertyOptional({
    description: 'Free-text search on sub-order number, product model or brand.',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Query params for the admin all-orders table. The admin-facing unit is the
 * sub-order (one product per vendor), so every filter narrows `SubOrder` rows.
 */
export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Filter by sub-order status (powers the status tabs).',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Filter by vendor id.' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive match on the courier name (e.g. Porter.ae).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  courier?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive search over sub-order number, product model and store name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Only orders created on/after this ISO date-time (inclusive).',
    example: '2026-07-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Only orders created on/before this ISO date-time (inclusive).',
    example: '2026-07-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

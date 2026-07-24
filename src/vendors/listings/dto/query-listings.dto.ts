import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryListingsDto {
  @ApiPropertyOptional({
    enum: ['all', 'pending', 'live', 'low-stock'],
    description:
      'Filter listings: all; pending (awaiting approval); live (approved & active); low-stock (live with stock at or below the low-stock threshold).',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['all', 'pending', 'live', 'low-stock'])
  status?: 'all' | 'pending' | 'live' | 'low-stock';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Free-text search term', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

}
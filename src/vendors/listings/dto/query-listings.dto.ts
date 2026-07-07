import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class QueryListingsDto {
  @ApiPropertyOptional({ enum: ['all', 'live', 'paused', 'low_stock'] })
  @IsOptional()
  @IsIn(['all', 'live', 'paused', 'low_stock'])
  status?: 'all' | 'live' | 'paused' | 'low_stock';

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
}
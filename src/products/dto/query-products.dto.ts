import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConditionGrade, ProductSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search (brand, model, description, colour)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ProductSource })
  @IsOptional()
  @IsEnum(ProductSource)
  source?: ProductSource;

  @ApiPropertyOptional({ enum: ConditionGrade })
  @IsOptional()
  @IsEnum(ConditionGrade)
  conditionGrade?: ConditionGrade;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}

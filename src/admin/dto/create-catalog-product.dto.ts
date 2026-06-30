import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, IsString, IsUrl, IsUUID,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { CatalogSpecsDto } from './catalog-specs.dto';

export class CreateCatalogProductDto {
  @ApiProperty({ description: 'Brand id (must reference an existing brand).', format: 'uuid' })
  @IsUUID()
  brandId!: string;

  @ApiProperty({ example: 'iPhone 14 Pro', description: 'Model name.' })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @ApiPropertyOptional({ example: 2022, minimum: 1970, maximum: 2100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1970) @Max(2100)
  year?: number;

  @ApiProperty({ description: 'Category id (must reference an existing category).', format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Official manufacturer stock photo URL.' })
  @IsOptional() @IsUrl()
  stockImageUrl?: string;

  @ApiPropertyOptional({ type: CatalogSpecsDto })
  @IsOptional() @ValidateNested() @Type(() => CatalogSpecsDto)
  specs?: CatalogSpecsDto;

  @ApiPropertyOptional({ description: 'Buyer-facing product description.' })
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ enum: CatalogStatus, default: CatalogStatus.active })
  @IsOptional() @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}

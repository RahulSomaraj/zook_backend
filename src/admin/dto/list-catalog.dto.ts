import { ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListCatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search over brand name, model and category name.' })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category id.', format: 'uuid' })
  @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by brand id.', format: 'uuid' })
  @IsOptional() @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ enum: CatalogStatus, description: 'Filter by catalog status.' })
  @IsOptional() @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @ApiPropertyOptional({ description: 'Include soft-deleted entries.', default: false })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  includeDeleted = false;
}

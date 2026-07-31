import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BooleanQuery } from '../../common/dto/boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Optional filters for GET /admin/product-specifications. */
export class ListProductSpecificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive search across the model name, the spec label and the spec value.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only specs belonging to catalog products in this category.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only specs of this one catalog product.',
  })
  @IsOptional()
  @IsUUID()
  catalogId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Only rows linked to a category specification (true) or only one-off free-text rows (false).',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  linkedOnly?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description:
      'Default. One row per catalog product with each spec label as a key ("Display": "...", "Chipset": "..."), and pagination counting products. Set false for one row per spec instead.',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  grouped = true;
}

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

/** Optional filters for GET /admin/category-specifications. */
export class ListCategorySpecificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Only return the specifications defined for this category. This is what the product form calls to know which fields to render.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive search over the specification label.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filter by active flag.' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  // `type: Boolean` is explicit for the same reason PaginationQueryDto spells
  // out `type: Number`: the field is initialised rather than annotated, so
  // emitDecoratorMetadata reports it as `Object` and Swagger UI renders a JSON
  // box instead of a checkbox.
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include soft-deleted (archived) specifications.',
    default: false,
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  includeDeleted = false;
}

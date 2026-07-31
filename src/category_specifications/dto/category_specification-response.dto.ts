import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Type } from '@nestjs/common';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';

const SPEC_ID = '44444444-4444-4444-4444-444444444444';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

/** A single specification definition, as returned inside the response envelope. */
export class CategorySpecificationResponseDto {
  @ApiProperty({ format: 'uuid', example: SPEC_ID })
  id: string;

  @ApiProperty({ format: 'uuid', example: CATEGORY_ID })
  categoryId: string;

  @ApiProperty({ example: 'RAM' })
  label: string;

  @ApiProperty({
    example: 0,
    description: 'Ascending display order on the form.',
  })
  sortOrder: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Set when archived; null for live rows.',
  })
  deletedAt: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, example: ADMIN_ID })
  createdBy: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, example: ADMIN_ID })
  updatedBy: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, example: null })
  deletedBy: string | null;

  @ApiPropertyOptional({
    type: Number,
    example: 12,
    description:
      'Catalog entries that have filled this specification in. Present on list and detail responses only — create and update do not load the relation.',
  })
  valueCount?: number;
}

/** Body of a paginated list, before the response envelope wraps it. */
export class CategorySpecificationListDto {
  @ApiProperty({ type: [CategorySpecificationResponseDto] })
  items: CategorySpecificationResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ArchiveResultDto {
  @ApiProperty({ format: 'uuid', example: SPEC_ID })
  id: string;

  @ApiProperty({ example: true })
  deleted: boolean;
}

export class RestoreResultDto {
  @ApiProperty({ format: 'uuid', example: SPEC_ID })
  id: string;

  @ApiProperty({ example: true })
  restored: boolean;
}

/**
 * Every handler's return value is wrapped by ResponseInterceptor before it goes
 * out, so the documented schema has to describe the envelope rather than the
 * raw return value. Models referenced here must be registered on the controller
 * with `@ApiExtraModels`, otherwise `$ref` points at a schema Swagger never emits.
 */
export class ApiEnvelopeDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ format: 'date-time' })
  timestamp: string;

  @ApiProperty({ example: '/admin/category-specifications' })
  path: string;
}

export function envelope(model: Type<unknown>) {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiEnvelopeDto) },
      {
        required: ['data'],
        properties: { data: { $ref: getSchemaPath(model) } },
      },
    ],
  };
}

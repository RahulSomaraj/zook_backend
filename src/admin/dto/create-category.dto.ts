import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Admin-creates a category. `slug` is derived from `name` when omitted. */
export class CreateCategoryDto {
  @ApiProperty({ example: 'Smartphones' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({
    description: 'URL-safe identifier. Auto-derived from name if omitted.',
    example: 'smartphones',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Emoji/glyph shown beside the category.', example: '📱' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @ApiPropertyOptional({ description: 'Whether the category shows in dropdowns.', default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order in dropdowns (asc).', default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

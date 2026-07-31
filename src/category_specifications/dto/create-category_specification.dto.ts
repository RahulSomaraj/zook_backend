import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCategorySpecificationDto {
  @ApiProperty({ description: 'Category this specification belongs to.' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({
    description: 'Attribute name shown on the product form, e.g. "RAM".',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  label: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    description:
      'Ascending display order on the product form. Omit to append the field after the existing ones.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Hides the field from the product form without archiving it.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

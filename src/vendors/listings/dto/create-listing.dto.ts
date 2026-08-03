import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConditionGrade } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateListingDto {
  @ApiProperty()
  @IsUUID()
  catalogId: string;

  @ApiProperty({ enum: ConditionGrade })
  @IsEnum(ConditionGrade)
  conditionGrade: ConditionGrade;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageVariant?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inspectionImages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  stockQty: number;

  @ApiPropertyOptional({
    description:
      'Courier pickup / store address. When provided, updates the vendor profile.',
  })
  @IsOptional()
  @IsString()
  storeAddress?: string;
}

import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

/** All create fields optional, plus the ability to toggle active state. */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

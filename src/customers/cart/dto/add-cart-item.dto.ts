import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ description: 'Product id to add to the cart.' })
  @IsString()
  productId!: string;

  @ApiProperty({ description: 'Quantity to add.', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity = 1;
}

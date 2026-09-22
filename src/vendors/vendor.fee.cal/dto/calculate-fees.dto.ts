import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class CalculateFeesDto {
  @ApiProperty({
    example: 2100,
    minimum: 0.01,
    maximum: 99999999.99,
    description: 'Listing price in AED, with at most two decimal places.',
  })
  // Keep the original JSON value so strings and booleans are not coerced into
  // valid prices by the global implicit-conversion setting.
  @Transform(
    ({ obj, key }: TransformFnParams): unknown =>
      (obj as Record<string, unknown>)[key],
  )
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(99999999.99)
  productPrice: number;
}

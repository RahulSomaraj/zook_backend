import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class SetFeeSettingsDto {
  @ApiProperty({
    example: 10,
    minimum: 0,
    maximum: 100,
    description: 'Commission percentage, with at most two decimal places.',
  })
  // Preserve the JSON value so implicit conversion cannot turn blanks or
  // booleans into valid fee percentages.
  @Transform(({ obj, key }) => obj[key])
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  commissionPercentage: number;

  @ApiProperty({
    example: 2.9,
    minimum: 0,
    maximum: 100,
    description:
      'Mamo percentage (2.9 means 2.9%), with at most two decimal places.',
  })
  @Transform(({ obj, key }) => obj[key])
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  mamoPercentage: number;
}

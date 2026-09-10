import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Measured weight of the packed parcel. Recorded by the vendor while the
 * sub-order is `preparing`; the courier booking uses exactly the stored value.
 */
export class RecordPackageWeightDto {
  @ApiProperty({
    description:
      'Measured weight of the packed parcel in kilograms (0.01–30, up to 3 decimal places).',
    example: 0.45,
    minimum: 0.01,
    maximum: 30,
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.01)
  @Max(30)
  weightKg!: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Customer self-registration payload. The dial code and the national number are
 * captured as two separate fields; the service combines them into the E.164
 * `phone` stored on the user and keeps `countryCode` on its own column.
 */
export class RegisterCustomerDto {
  @ApiProperty({ example: 'Aisha Rahman', description: 'Customer full name.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName!: string;

  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    example: '+971',
    description: 'Dial code in E.164 form, stored on its own field.',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{0,3}$/, {
    message: 'countryCode must be a dial code like +971, +91 or +1',
  })
  countryCode!: string;

  @ApiProperty({
    example: '501234567',
    description: 'National mobile number without the country code.',
  })
  @IsString()
  @Matches(/^[0-9\s()\-.]{4,15}$/, { message: 'Invalid phone number' })
  phone!: string;
}

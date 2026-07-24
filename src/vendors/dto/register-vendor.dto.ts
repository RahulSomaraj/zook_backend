import { ApiProperty } from '@nestjs/swagger';
import { Emirate } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterVendorDto {
  @ApiProperty({ example: 'Al Turath Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName!: string;

  @ApiProperty({
    example: '+971501234567',
    description: 'Mobile number; UAE default if no country code.',
  })
  @IsString()
  @Matches(/^[+]?[0-9\s()\-.]{6,20}$/, { message: 'Invalid phone number' })
  phone!: string;

  @ApiProperty({
    example: 'Ahmed Al Turath',
    description: 'Owner full name, as per Emirates ID.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerFullName!: string;

  @ApiProperty({ example: 'store@alturath.ae' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    example: 'Shop 4, Al Turath Building, Al Quoz Industrial Area 3',
    description: 'Courier pickup address.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  storeAddress!: string;

  @ApiProperty({ example: 'Al Quoz', description: 'Pickup area / locality.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  area!: string;

  @ApiProperty({ enum: Emirate, example: Emirate.dubai })
  @IsEnum(Emirate)
  emirate!: Emirate;

  @ApiProperty({
    example: true,
    description:
      'Must be true — confirms the vendor accepted the terms of service and privacy policy.',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' ? true : value === false || value === 'false' ? false : value,
  )
  @IsBoolean()
  @Equals(true, {
    message: 'You must accept the terms of service and privacy policy',
  })
  acceptedTermsAndPolicy!: boolean;
}

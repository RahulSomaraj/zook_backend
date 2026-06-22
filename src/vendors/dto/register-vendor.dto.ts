import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterVendorDto {
  @ApiProperty({ example: 'Al Turath Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName!: string;

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
}

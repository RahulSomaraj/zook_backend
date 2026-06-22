import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    example: '+971501234567',
    description: 'Mobile number; UAE default if no country code.',
  })
  @IsString()
  @Matches(/^[+]?[0-9\s()\-.]{6,20}$/, { message: 'Invalid phone number' })
  phone!: string;
}

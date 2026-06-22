import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '+971501234567' })
  @IsString()
  @Matches(/^[+]?[0-9\s()\-.]{6,20}$/, { message: 'Invalid phone number' })
  phone!: string;

  @ApiProperty({ example: '1234', description: '4-digit code from SMS.' })
  @IsString()
  @Length(4, 4)
  @Matches(/^[0-9]{4}$/, { message: 'Code must be 4 digits' })
  code!: string;
}

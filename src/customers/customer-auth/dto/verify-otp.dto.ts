import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '+971501234567' })
  @IsString()
  @Matches(/^[+]?[0-9\s()\-.]{6,20}$/, { message: 'Invalid phone number' })
  phone!: string;

  @ApiProperty({ example: '123456', description: '6-digit code from SMS.' })
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'Code must be 6 digits' })
  code!: string;
}

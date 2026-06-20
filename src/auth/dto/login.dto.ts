import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/** Email/password login (POST /auth/login). Returns app-issued tokens. */
export class LoginDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  password!: string;
}

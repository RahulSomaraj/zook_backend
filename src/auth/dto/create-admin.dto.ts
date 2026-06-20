import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Create a new admin (POST /auth/admin). Admin-only — there is no public admin
 * signup. An existing admin provisions further admins.
 */
export class CreateAdminDto {
  @ApiProperty({ example: 'ops@zook.ae' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'S3cureAdminPass!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiPropertyOptional({ example: 'Omar Saleh' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
}

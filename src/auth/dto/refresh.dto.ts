import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

/** Exchange a refresh token for a fresh access token (POST /auth/refresh). */
export class RefreshDto {
  @ApiProperty({ description: 'A valid refresh token issued at login/signup' })
  @IsJWT()
  refreshToken!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'A valid refresh token previously issued by /auth.',
  })
  @IsJWT()
  refreshToken!: string;
}

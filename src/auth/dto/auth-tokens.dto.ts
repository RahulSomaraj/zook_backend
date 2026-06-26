import { ApiProperty } from '@nestjs/swagger';

/** Shape returned by login / refresh. Documented for Swagger. */
export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ type: [String], example: ['admin'] })
  roles!: string[];

  @ApiProperty({ example: 'super_admin', nullable: true })
  adminLevel!: string | null;

  @ApiProperty({ nullable: true, description: 'Vendor-only. true = onboarding complete, null for non-vendors.' })
  isVerified!: boolean | null;
}

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header.' })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived JWT used to obtain a new access token.',
  })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({
    description: 'Access-token lifetime in seconds.',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

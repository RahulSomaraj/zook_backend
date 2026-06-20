import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsJWT, IsOptional } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

/**
 * Google/Apple sign-in (POST /auth/oauth/google | /auth/oauth/apple).
 *
 * The client completes the provider handshake and sends the resulting
 * `idToken`. The backend verifies it, find-or-creates the user in Postgres, and
 * returns our own session tokens. `role` only applies when creating a brand-new
 * account (customer or vendor; defaults to customer).
 */
export class OAuthSignInDto {
  @ApiProperty({ description: "The provider's id_token (a JWT)" })
  @IsJWT()
  idToken!: string;

  @ApiPropertyOptional({
    enum: [Role.CUSTOMER, Role.VENDOR],
    default: Role.CUSTOMER,
    description: 'Role for a newly created account. Ignored if the user exists.',
  })
  @IsOptional()
  @IsIn([Role.CUSTOMER, Role.VENDOR])
  role?: Role.CUSTOMER | Role.VENDOR;
}

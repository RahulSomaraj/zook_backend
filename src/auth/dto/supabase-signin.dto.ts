import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsJWT, IsOptional } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

/**
 * Supabase sign-in (POST /auth/oauth/supabase).
 *
 * The client completes the Google handshake *through Supabase* and sends the
 * resulting `accessToken` (a Supabase-signed JWT). The backend verifies it,
 * find-or-creates the user in Postgres, and returns our own session tokens.
 * `role` only applies when creating a brand-new account.
 */
export class SupabaseSignInDto {
  @ApiProperty({ description: "The Supabase session access_token (a JWT)" })
  @IsJWT()
  accessToken!: string;

  @ApiPropertyOptional({
    enum: [Role.CUSTOMER, Role.VENDOR],
    default: Role.CUSTOMER,
    description: 'Role for a newly created account. Ignored if the user exists.',
  })
  @IsOptional()
  @IsIn([Role.CUSTOMER, Role.VENDOR])
  role?: Role.CUSTOMER | Role.VENDOR;
}

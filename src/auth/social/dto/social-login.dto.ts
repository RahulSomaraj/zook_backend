import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

/**
 * Payload for social sign-in. The client authenticates with Google *through
 * Supabase* and forwards the resulting Supabase access token; the backend
 * verifies it and issues its own session JWTs.
 */
export class SocialLoginDto {
  @ApiProperty({
    description:
      'A Supabase access token (JWT) obtained after the user signed in with Google via the Supabase client SDK.',
  })
  @IsJWT()
  supabaseAccessToken!: string;
}

import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { AuthProvider } from '@prisma/client';
import type { VerifiedIdentity } from './oauth-verifier.service';

/**
 * Shape of the claims Supabase puts in an access_token. Only the fields we read
 * are listed; `user_metadata` carries the Google profile (name/avatar).
 */
interface SupabaseClaims extends JWTPayload {
  email?: string;
  phone?: string;
  role?: string; // 'authenticated'
  user_metadata?: {
    full_name?: string;
    name?: string;
    email_verified?: boolean;
    avatar_url?: string;
    picture?: string;
  };
}

/**
 * Verifies Supabase-issued access tokens. The client performs the Google
 * handshake *through Supabase* and sends us the resulting `access_token`; we
 * cryptographically verify it and return a normalised identity, exactly like
 * {@link OAuthVerifierService} does for raw Google/Apple id_tokens.
 *
 * Two signing schemes are supported transparently:
 *  - Asymmetric (ES256/RS256) — the default for newer projects. Verified
 *    against the project JWKS endpoint.
 *  - Legacy HS256 — verified with the project JWT secret (SUPABASE_JWT_SECRET).
 */
@Injectable()
export class SupabaseAuthService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseAuthService.name);

  private issuer?: string; // `${SUPABASE_URL}/auth/v1`
  private hmacSecret?: Uint8Array;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('supabase.url');
    const secret = this.config.get<string>('supabase.jwtSecret');

    if (url) {
      const base = url.replace(/\/+$/, '');
      this.issuer = `${base}/auth/v1`;
      this.jwks = createRemoteJWKSet(
        new URL(`${base}/auth/v1/.well-known/jwks.json`),
      );
    }
    if (secret) {
      this.hmacSecret = new TextEncoder().encode(secret);
    }
  }

  async verify(accessToken: string): Promise<VerifiedIdentity> {
    if (!this.issuer) {
      throw new UnauthorizedException('Supabase sign-in is not configured');
    }

    try {
      const payload = await this.verifyToken(accessToken);
      if (!payload.sub) throw new Error('missing subject');

      const meta = payload.user_metadata ?? {};
      return {
        provider: AuthProvider.supabase,
        providerUserId: payload.sub, // Supabase user id
        email: payload.email,
        emailVerified: meta.email_verified === true,
        fullName: meta.full_name ?? meta.name,
      };
    } catch (err) {
      this.logger.warn(`Supabase token verification failed: ${String(err)}`);
      throw new UnauthorizedException('Invalid Supabase token');
    }
  }

  /** Pick the verification key based on the token's signing algorithm. */
  private async verifyToken(token: string): Promise<SupabaseClaims> {
    const { alg } = decodeProtectedHeader(token);
    const options = { issuer: this.issuer!, audience: 'authenticated' };

    if (alg === 'HS256') {
      if (!this.hmacSecret) {
        throw new Error(
          'token is HS256 but SUPABASE_JWT_SECRET is not configured',
        );
      }
      const { payload } = await jwtVerify(token, this.hmacSecret, options);
      return payload as SupabaseClaims;
    }

    if (!this.jwks) {
      throw new Error('JWKS endpoint not configured');
    }
    const { payload } = await jwtVerify(token, this.jwks, options);
    return payload as SupabaseClaims;
  }
}

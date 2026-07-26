import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

/** Normalised identity extracted from a verified Supabase access token. */
export interface VerifiedSocialIdentity {
  /** Supabase user id (the token `sub`) — stable, unique, our link key. */
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  /** Underlying provider, e.g. 'google'. */
  provider: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface SupabaseJwtPayload extends JWTPayload {
  email?: string;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: {
    email_verified?: boolean;
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
}

/**
 * Verifies Supabase-issued JWTs. Supports both signing schemes:
 *   - Legacy HS256 projects → verify with SUPABASE_JWT_SECRET.
 *   - Asymmetric (ES256/RS256) projects → verify against the project JWKS.
 *
 * Signature, issuer and expiry are all checked. The remote JWKS is fetched once
 * and cached by jose (with its own rotation handling).
 */
@Injectable()
export class SupabaseTokenVerifier {
  private readonly logger = new Logger(SupabaseTokenVerifier.name);
  private readonly issuer: string | null;
  private readonly hs256Key: Uint8Array | null;
  private readonly jwks: JWTVerifyGetKey | null;

  constructor(config: ConfigService) {
    const url = (config.get<string>('supabase.url') ?? '').replace(/\/+$/, '');
    const secret = config.get<string>('supabase.jwtSecret');

    this.issuer = url ? `${url}/auth/v1` : null;

    if (secret) {
      // Legacy symmetric project.
      this.hs256Key = new TextEncoder().encode(secret);
      this.jwks = null;
    } else if (url) {
      // Asymmetric project — verify via the published JWKS.
      this.hs256Key = null;
      this.jwks = createRemoteJWKSet(
        new URL(`${url}/auth/v1/.well-known/jwks.json`),
      );
    } else {
      this.hs256Key = null;
      this.jwks = null;
    }
  }

  async verify(token: string): Promise<VerifiedSocialIdentity> {
    if (!this.issuer || (!this.hs256Key && !this.jwks)) {
      throw new UnauthorizedException('Social login is not configured.');
    }

    let payload: SupabaseJwtPayload;
    try {
      const key = this.hs256Key ?? this.jwks!;
      const result = await jwtVerify(token, key as any, {
        issuer: this.issuer,
        // Supabase access tokens carry aud 'authenticated'.
        audience: 'authenticated',
      });
      payload = result.payload as SupabaseJwtPayload;
    } catch (err) {
      this.logger.warn(
        `Supabase token verification failed: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw new UnauthorizedException({
        message: 'Invalid or expired social token.',
        code: 'SOCIAL_TOKEN_INVALID',
      });
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Social token missing subject.');
    }

    const provider = payload.app_metadata?.provider ?? 'supabase';
    const meta = payload.user_metadata ?? {};
    const email = payload.email ?? null;
    // Google emails are always verified; otherwise trust the explicit claim.
    const emailVerified =
      meta.email_verified ?? (provider === 'google' && email !== null);

    return {
      providerUserId: payload.sub,
      email: email ? email.toLowerCase() : null,
      emailVerified,
      provider,
      fullName: meta.full_name ?? meta.name ?? null,
      avatarUrl: meta.avatar_url ?? meta.picture ?? null,
    };
  }
}

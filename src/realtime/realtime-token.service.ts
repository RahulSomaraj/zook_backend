import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Mints short-lived JWTs the frontend uses to authorize Supabase Realtime
 * (`supabase.realtime.setAuth(token)`).
 *
 * Why this exists: this backend issues its OWN session JWTs, so the app's
 * `User.id` is not the same as the Supabase auth user id. We sign a token with
 * the Supabase project JWT secret (so Realtime accepts it) carrying
 * `sub = <appUserId>`. That makes `auth.uid()` inside the RLS policy equal the
 * app User.id, which matches the `onboarding:<appUserId>` topic the backend
 * broadcasts to — keeping our own User.id authoritative everywhere and avoiding
 * any dependency on the client's Supabase session.
 *
 * Note: this works for Supabase projects that use the shared HS256 JWT secret.
 * Asymmetric (RS256/ES256) projects don't expose a shared secret — see
 * docs/realtime/realtime-how-it-works.md for that variant.
 */
@Injectable()
export class RealtimeTokenService {
  private readonly supabaseJwtSecret?: string;
  private readonly ttlSeconds = 60 * 60; // 1 hour

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.supabaseJwtSecret = this.config.get<string>('supabase.jwtSecret');
  }

  async mint(userId: string): Promise<{ token: string; expiresIn: number }> {
    if (!this.supabaseJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET not configured for realtime tokens');
    }
    const token = await this.jwt.signAsync(
      { sub: userId, role: 'authenticated', aud: 'authenticated' },
      { secret: this.supabaseJwtSecret, expiresIn: this.ttlSeconds },
    );
    return { token, expiresIn: this.ttlSeconds };
  }
}

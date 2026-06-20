import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthProvider } from '@prisma/client';

/** Normalised identity extracted from a verified provider token. */
export interface VerifiedIdentity {
  provider: AuthProvider;
  providerUserId: string; // the provider's stable subject (sub)
  email?: string;
  emailVerified: boolean;
  fullName?: string;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

/**
 * Verifies Google and Apple identity tokens server-side. The mobile/web client
 * performs the provider handshake and sends us the resulting `id_token`; we
 * cryptographically verify it and return a normalised identity.
 */
@Injectable()
export class OAuthVerifierService implements OnModuleInit {
  private readonly logger = new Logger(OAuthVerifierService.name);

  private googleClient!: OAuth2Client;
  private googleClientIds: string[] = [];
  private appleClientIds: string[] = [];
  private appleJwks!: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.googleClientIds = this.config.get<string[]>('oauth.google.clientIds') ?? [];
    this.appleClientIds = this.config.get<string[]>('oauth.apple.clientIds') ?? [];
    this.googleClient = new OAuth2Client();
    this.appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }

  async verify(
    provider: AuthProvider,
    idToken: string,
  ): Promise<VerifiedIdentity> {
    return provider === AuthProvider.google
      ? this.verifyGoogle(idToken)
      : this.verifyApple(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedIdentity> {
    if (this.googleClientIds.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientIds,
      });
      const p = ticket.getPayload();
      if (!p?.sub) throw new Error('missing subject');
      return {
        provider: AuthProvider.google,
        providerUserId: p.sub,
        email: p.email,
        emailVerified: p.email_verified === true,
        fullName: p.name,
      };
    } catch (err) {
      this.logger.warn(`Google token verification failed: ${String(err)}`);
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  private async verifyApple(idToken: string): Promise<VerifiedIdentity> {
    if (this.appleClientIds.length === 0) {
      throw new UnauthorizedException('Apple sign-in is not configured');
    }
    try {
      const { payload } = await jwtVerify(idToken, this.appleJwks, {
        issuer: APPLE_ISSUER,
        audience: this.appleClientIds,
      });
      const p = payload as JWTPayload & {
        email?: string;
        email_verified?: boolean | string;
      };
      if (!p.sub) throw new Error('missing subject');
      return {
        provider: AuthProvider.apple,
        providerUserId: p.sub,
        email: p.email,
        // Apple sends email_verified as the string "true"/"false".
        emailVerified: p.email_verified === true || p.email_verified === 'true',
      };
    } catch (err) {
      this.logger.warn(`Apple token verification failed: ${String(err)}`);
      throw new UnauthorizedException('Invalid Apple token');
    }
  }
}

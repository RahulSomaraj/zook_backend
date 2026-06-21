import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TokenSubject {
  id: string;
  email: string;
  roles: Role[];
  adminLevel: string | null;
}

/**
 * Signs and verifies the app's own access + refresh JWTs.
 *
 * Both tokens are signed with JWT_SECRET (HS256) and carry a `type` claim so an
 * access token can never be replayed where a refresh token is expected, and
 * vice versa. Refresh is stateless (no server-side store) - rotation happens by
 * issuing a fresh pair on every /auth/refresh call.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('jwt.secret')!;
    this.accessTtl = config.get<string>('jwt.accessExpiresIn') ?? '15m';
    this.refreshTtl = config.get<string>('jwt.refreshExpiresIn') ?? '30d';
  }

  async issueTokens(user: TokenSubject): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      adminLevel: user.adminLevel,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, this.signOptions(this.accessTtl)),
      this.jwt.signAsync(refreshPayload, this.signOptions(this.refreshTtl)),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlToSeconds(this.accessTtl),
    };
  }

  /** Verifies a refresh token and asserts its `type`. Throws if invalid/expired. */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.secret,
    });
    if (payload.type !== 'refresh') {
      throw new Error('Not a refresh token');
    }
    return payload;
  }

  private signOptions(expiresIn: string): JwtSignOptions {
    return {
      secret: this.secret,
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
  }

  /** Converts a jsonwebtoken-style ttl ("15m", "30d", "900") to seconds. */
  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const factor: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (factor[unit] ?? 1);
  }
}

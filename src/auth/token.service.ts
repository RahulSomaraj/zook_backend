import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
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

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('jwt.secret')!;
    this.accessTtl = config.get<string>('jwt.accessExpiresIn') ?? '15m';
    this.refreshTtl = config.get<string>('jwt.refreshExpiresIn') ?? '30d';
  }

  async issueTokens(user: TokenSubject): Promise<AuthTokens> {
    const jti = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      adminLevel: user.adminLevel,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, this.signOptions(this.accessTtl)),
      this.jwt.signAsync(refreshPayload, this.signOptions(this.refreshTtl)),
    ]);

    const expiresAt = new Date(
      Date.now() + this.ttlToSeconds(this.refreshTtl) * 1000,
    );
    await this.prisma.refreshToken.create({
      data: { jti, userId: user.id, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlToSeconds(this.accessTtl),
    };
  }

  /** Verifies a refresh token signature + type, and returns its payload. */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.secret,
    });
    if (payload.type !== 'refresh') {
      throw new Error('Not a refresh token');
    }
    return payload;
  }

  /** Returns true only if the jti exists in DB, is not revoked, and has not expired. */
  async isRefreshTokenValid(jti: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { jti },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      return false;
    }
    return true;
  }

  /** Marks a single refresh token as revoked. No-op if already revoked. */
  async revokeRefreshToken(jti: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active refresh token for a user (logout from all devices). */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Short-lived token proving the holder verified ownership of `phone`. */
  async signPhoneVerifyToken(phone: string): Promise<string> {
    return this.jwt.signAsync(
      { phone, type: 'phone_verify' },
      this.signOptions('15m'),
    );
  }

  /** Verifies a phone-verify token and returns the phone it was issued for. */
  async verifyPhoneVerifyToken(token: string): Promise<{ phone: string }> {
    const payload = await this.jwt.verifyAsync<{ phone: string; type: string }>(
      token,
      { secret: this.secret },
    );
    if (payload.type !== 'phone_verify') {
      throw new Error('Not a phone-verify token');
    }
    return { phone: payload.phone };
  }

  private signOptions(expiresIn: string): JwtSignOptions {
    return {
      secret: this.secret,
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const factor: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (factor[unit] ?? 1);
  }
}

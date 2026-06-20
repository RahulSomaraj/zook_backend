import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppJwtPayload } from './jwt.strategy';
import { Role } from '../common/enums/role.enum';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string; // access-token lifetime, e.g. "15m"
}

interface TokenSubject {
  id: string;
  email: string;
  role: Role;
}

/**
 * Issues and verifies the application's own JWTs (access + refresh).
 * Stateless: a refresh token is simply a long-lived JWT marked `typ: 'refresh'`.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('jwt.secret')!;
    this.accessExpiresIn = config.get<string>('jwt.accessExpiresIn')!;
    this.refreshExpiresIn = config.get<string>('jwt.refreshExpiresIn')!;
  }

  async issue(user: TokenSubject): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, typ: 'access' },
      { secret: this.secret, expiresIn: this.accessExpiresIn },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'refresh' },
      { secret: this.secret, expiresIn: this.refreshExpiresIn },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessExpiresIn,
    };
  }

  /** Verify a refresh token and return its subject id. */
  async verifyRefresh(token: string): Promise<string> {
    let payload: AppJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AppJwtPayload>(token, {
        secret: this.secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    return payload.sub;
  }
}

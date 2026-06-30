import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role as DbRole } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../database/prisma.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { AuthTokens, TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Authenticate an admin by email + password and return a token pair.
   * Generic 401 on any credential failure so we don't leak which part was wrong.
   */
  async adminLogin(email: string, password: string): Promise<AuthTokensDto> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: true, admin: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isAdmin = user.userRoles.some((r) => r.role === DbRole.admin);
    if (!isAdmin || !user.admin) {
      throw new ForbiddenException('This account is not an admin');
    }
    if ((user.admin.status as string) !== 'active') {
      throw new ForbiddenException('Admin account is suspended');
    }

    const result = await this.issueFor(user.id);
    return this.toResponse(result);
  }

  /**
   * Exchange a valid refresh token for a fresh token pair (rotation). The old
   * refresh token's jti is revoked in DB so it cannot be reused.
   */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    let userId: string;
    let jti: string;
    try {
      const payload = await this.tokens.verifyRefreshToken(refreshToken);
      userId = payload.sub;
      jti = payload.jti;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const valid = await this.tokens.isRefreshTokenValid(jti);
    if (!valid) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Revoke old token before issuing new pair (rotation).
    await this.tokens.revokeRefreshToken(jti);

    const result = await this.issueFor(userId);
    return this.toResponse(result);
  }

  /** Revoke the supplied refresh token, ending the current session. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.tokens.verifyRefreshToken(refreshToken);
      await this.tokens.revokeRefreshToken(payload.jti);
    } catch {
      // Expired or invalid token — session is already dead; treat as success.
    }
  }

  /** Revoke all refresh tokens for a user, logging out every device. */
  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllRefreshTokens(userId);
  }

  /**
   * Loads a user, re-validates any role-specific status guards, and signs a
   * fresh token pair. Role-agnostic so a single refresh endpoint serves every
   * user type; a user holding several roles must pass every relevant guard.
   */
  private async issueFor(userId: string): Promise<{
    tokens: AuthTokens;
    user: {
      id: string;
      email: string;
      fullName: string | null;
      roles: Role[];
      adminLevel: string | null;
      isVerified: boolean | null;
      storeName: string | null;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: true, admin: true, vendor: true },
    });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    const roles = user.userRoles.map((r) => r.role as Role);

    // Per-role status guards: block refresh if an active role's profile is
    // disabled, even though the JWT itself is still valid.
    if (roles.includes(Role.ADMIN)) {
      if (!user.admin || (user.admin.status as string) !== 'active') {
        throw new ForbiddenException('Admin account is no longer active');
      }
    }
    if (roles.includes(Role.VENDOR) && user.vendor?.deletedAt) {
      throw new ForbiddenException('Vendor account is closed');
    }

    const adminLevel = (user.admin?.level as string) ?? null;
    const isVerified = roles.includes(Role.VENDOR)
      ? (user.vendor?.status as string) === 'approved'
      : null;
    const storeName = user.vendor?.storeName ?? null;

    const tokens = await this.tokens.issueTokens({
      id: user.id,
      email: user.email,
      roles,
      adminLevel,
    });

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        adminLevel,
        isVerified,
        storeName,
      },
    };
  }

  private toResponse(result: {
    tokens: AuthTokens;
    user: {
      id: string;
      email: string;
      fullName: string | null;
      roles: Role[];
      adminLevel: string | null;
      isVerified: boolean | null;
      storeName: string | null;
    };
  }): AuthTokensDto {
    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    };
  }
}

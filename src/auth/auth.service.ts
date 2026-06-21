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
   * Exchange a valid refresh token for a fresh token pair (rotation).
   * Re-checks that the user is still an active admin at refresh time.
   */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    let userId: string;
    try {
      const payload = await this.tokens.verifyRefreshToken(refreshToken);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const result = await this.issueFor(userId);
    return this.toResponse(result);
  }

  /** Loads a user, asserts active-admin, and signs a token pair. */
  private async issueFor(userId: string): Promise<{
    tokens: AuthTokens;
    user: {
      id: string;
      email: string;
      fullName: string | null;
      roles: Role[];
      adminLevel: string | null;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: true, admin: true },
    });

    const isAdmin = user?.userRoles.some((r) => r.role === DbRole.admin);
    if (
      !user ||
      !isAdmin ||
      !user.admin ||
      (user.admin.status as string) !== 'active'
    ) {
      throw new ForbiddenException('Admin account is no longer active');
    }

    const roles = user.userRoles.map((r) => r.role as Role);
    const adminLevel = user.admin.level as string;

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

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role as DbRole } from '@prisma/client';
import { AuthTokensDto } from '../../auth/dto/auth-tokens.dto';
import { TokenService } from '../../auth/token.service';
import { Role } from '../../common/enums/role.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { PrismaService } from '../../database/prisma.service';
import { OtpService } from '../../otp/otp.service';

export interface RequestOtpResult {
  phone: string;
  sent: true;
  expiresInSeconds: number;
  devCode?: string;
}

export interface VerifyOtpResult {
  status: 'authenticated';
  tokens: AuthTokensDto;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  async requestOtp(rawPhone: string): Promise<RequestOtpResult> {
    const phone = normalizePhone(rawPhone);
    const issued = await this.otp.issue(phone, 'customer_auth');
    return {
      phone,
      sent: true,
      expiresInSeconds: issued.expiresInSeconds,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  async verifyOtp(rawPhone: string, code: string): Promise<VerifyOtpResult> {
    const phone = normalizePhone(rawPhone);
    const ok = await this.otp.verify(phone, code, 'customer_auth');
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { phone },
        include: { userRoles: true, admin: true },
      });

      if (!existing) {
        const created = await tx.user.create({
          data: {
            email: this.syntheticEmailForPhone(phone),
            phone,
            phoneVerified: true,
          },
          include: { userRoles: true, admin: true },
        });
        await tx.userRole.create({
          data: { userId: created.id, role: DbRole.customer },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          include: { userRoles: true, admin: true },
        });
      }

      if (!existing.phoneVerified) {
        await tx.user.update({
          where: { id: existing.id },
          data: { phoneVerified: true },
        });
      }

      if (!existing.userRoles.some((role) => role.role === DbRole.customer)) {
        await tx.userRole.create({
          data: { userId: existing.id, role: DbRole.customer },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { userRoles: true, admin: true },
      });
    });

    const roles = user.userRoles.map((r) => r.role as Role);
    const tokens = await this.tokens.issueTokens({
      id: user.id,
      email: user.email,
      roles,
      adminLevel: user.admin?.level ?? null,
    });

    return {
      status: 'authenticated',
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles,
          adminLevel: user.admin?.level ?? null,
          isVerified: null,
          storeName: null,
        },
      },
    };
  }

  private syntheticEmailForPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `customer+${digits}@zook.local`;
  }
}

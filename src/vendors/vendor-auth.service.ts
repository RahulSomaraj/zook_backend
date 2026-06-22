import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role as DbRole } from '@prisma/client';
import { AuthTokensDto } from '../auth/dto/auth-tokens.dto';
import { TokenService } from '../auth/token.service';
import { Role } from '../common/enums/role.enum';
import { normalizePhone } from '../common/utils/phone.util';
import { PrismaService } from '../database/prisma.service';
import { OtpService } from '../otp/otp.service';
import { RegisterVendorDto } from './dto/register-vendor.dto';

export interface RequestOtpResult {
  phone: string;
  sent: true;
  expiresInSeconds: number;
  devCode?: string;
}

export type VerifyOtpResult =
  | { status: 'authenticated'; tokens: AuthTokensDto }
  | { status: 'verified'; verificationToken: string };

@Injectable()
export class VendorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  /** Step 1: send an OTP to the supplied phone number. */
  async requestOtp(rawPhone: string): Promise<RequestOtpResult> {
    const phone = normalizePhone(rawPhone);
    const issued = await this.otp.issue(phone);
    return {
      phone,
      sent: true,
      expiresInSeconds: issued.expiresInSeconds,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  /**
   * Step 2: verify the OTP. If a user already owns this phone, log them in and
   * return session tokens. Otherwise return a short-lived verificationToken the
   * client passes to /register to create the account.
   */
  async verifyOtp(rawPhone: string, code: string): Promise<VerifyOtpResult> {
    const phone = normalizePhone(rawPhone);
    const ok = await this.otp.verify(phone, code);
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.prisma.user.findFirst({
      where: { phone },
      include: { userRoles: true, admin: true },
    });

    if (user) {
      if (!user.phoneVerified) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerified: true },
        });
      }
      const roles = user.userRoles.map((r) => r.role as Role);
      const tokens = await this.tokens.issueTokens({
        id: user.id,
        email: user.email,
        roles,
        adminLevel: user.admin?.level ?? null,
      });
      return {
        status: 'authenticated',
        tokens: this.toTokensDto(tokens, {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles,
          adminLevel: user.admin?.level ?? null,
        }),
      };
    }

    const verificationToken = await this.tokens.signPhoneVerifyToken(phone);
    return { status: 'verified', verificationToken };
  }

  /**
   * Step 3: create the vendor account. `phone` is the number proven by the
   * phone-verify token (validated by PhoneVerifyGuard), not taken from the body.
   */
  async register(
    phone: string,
    dto: RegisterVendorDto,
  ): Promise<AuthTokensDto> {
    const email = dto.email.trim().toLowerCase();
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'An account with this email or phone already exists',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          fullName: dto.ownerFullName,
          phoneVerified: true,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, role: DbRole.vendor },
      });
      await tx.vendor.create({
        data: { userId: created.id, storeName: dto.storeName },
      });
      return created;
    });

    const tokens = await this.tokens.issueTokens({
      id: user.id,
      email: user.email,
      roles: [Role.VENDOR],
      adminLevel: null,
    });
    return this.toTokensDto(tokens, {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: [Role.VENDOR],
      adminLevel: null,
    });
  }

  private toTokensDto(
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: {
      id: string;
      email: string;
      fullName: string | null;
      roles: Role[];
      adminLevel: string | null;
    },
  ): AuthTokensDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      user,
    };
  }
}

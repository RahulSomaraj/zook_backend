import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role as DbRole, VendorStatus } from '@prisma/client';
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
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  devCode?: string;
}

export type VerifyOtpResult =
  | { status: 'authenticated'; tokens: AuthTokensDto }
  | { status: 'verified'; verificationToken: string };

export interface VendorMeResult {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  roles: Role[];
  vendor: { id: string; storeName: string; status: VendorStatus } | null;
}

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
    // Reflect the account's current verification state (false if no account yet).
    const user = await this.prisma.user.findFirst({
      where: { phone },
      select: { phoneVerified: true, emailVerified: true },
    });
    return {
      phone,
      sent: true,
      expiresInSeconds: issued.expiresInSeconds,
      isPhoneVerified: user?.phoneVerified ?? false,
      isEmailVerified: user?.emailVerified ?? false,
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
    const ok = await this.otp.verify(phone, code, 'vendor_auth');
    if (!ok) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.prisma.user.findFirst({
      where: { phone },
      include: { userRoles: true, admin: true, vendor: true },
    });

    if (user) {
      if (!user.phoneVerified) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerified: true },
        });
      }
      const roles = user.userRoles.map((r) => r.role as Role);
      const isVerified = user.vendor
        ? user.vendor.status === VendorStatus.approved
        : null;
      const storeName = user.vendor?.storeName ?? null;
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
          isVerified,
          storeName,
        }),
      };
    }

    const verificationToken = await this.tokens.signPhoneVerifyToken(phone);
    return { status: 'verified', verificationToken };
  }

  /**
   * Create the vendor account (vendor create page). The phone supplied in the
   * body is normalised and stored on the user, so it can be used for OTP login
   * later.
   */
  async register(dto: RegisterVendorDto): Promise<AuthTokensDto> {
    const email = dto.email.trim().toLowerCase();
    const phone = normalizePhone(dto.phone);
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
          termsAccepted: dto.acceptedTermsAndPolicy,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, role: DbRole.vendor },
      });
      await tx.vendor.create({
        data: {
          userId: created.id,
          storeName: dto.storeName,
          storeAddress: dto.storeAddress,
          pickupArea: dto.area,
          pickupEmirate: dto.emirate,
        },
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
      isVerified: false,
      storeName: dto.storeName,
    });
  }

  /**
   * "Who am I" for an authenticated vendor session. Reads the user id from the
   * validated access token and returns the current identity plus the core
   * vendor profile — the lightweight call a client makes on app load to confirm
   * the session is still valid.
   */
  async me(userId: string): Promise<VendorMeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: true, vendor: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      roles: user.userRoles.map((r) => r.role as Role),
      vendor: user.vendor
        ? {
            id: user.vendor.id,
            storeName: user.vendor.storeName,
            status: user.vendor.status,
          }
        : null,
    };
  }

  private toTokensDto(
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: {
      id: string;
      email: string;
      fullName: string | null;
      roles: Role[];
      adminLevel: string | null;
      isVerified: boolean | null;
      storeName: string | null;
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

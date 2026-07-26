import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role as DbRole } from '@prisma/client';
import { AuthTokensDto } from '../../auth/dto/auth-tokens.dto';
import { TokenService } from '../../auth/token.service';
import { Role } from '../../common/enums/role.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { PrismaService } from '../../database/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { SocialAuthService } from '../../auth/social/social-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';

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
    private readonly social: SocialAuthService,
  ) {}

  /**
   * Google sign-in / signup via Supabase. Verifies the Supabase token, links or
   * creates the customer account, and returns a session. New accounts have no
   * phone yet — the checkout flow enforces phone verification (see
   * PhoneVerifiedGuard), so signup stays frictionless.
   */
  async socialGoogle(
    supabaseAccessToken: string,
  ): Promise<{ status: 'authenticated'; tokens: AuthTokensDto; isNewUser: boolean }> {
    const result = await this.social.authenticate(supabaseAccessToken);
    return {
      status: 'authenticated',
      tokens: result.tokens,
      isNewUser: result.isNewUser,
    };
  }

  /**
   * Step 1 of attaching a phone to the CURRENT (authenticated) user — used by
   * social-signup customers who have no phone yet (e.g. blocked at checkout by
   * PhoneVerifiedGuard). Rejects phones already owned by another account
   * before sending, so we never burn an SMS on a doomed attach.
   */
  async requestPhoneAttachOtp(
    userId: string,
    rawPhone: string,
  ): Promise<RequestOtpResult> {
    const phone = normalizePhone(rawPhone);
    const owner = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: userId } },
      select: { id: true },
    });
    if (owner) {
      throw new ConflictException({
        message: 'This phone number is already linked to another account',
        code: 'PHONE_TAKEN',
      });
    }
    const issued = await this.otp.issue(phone, 'customer_auth');
    return {
      phone,
      sent: true,
      expiresInSeconds: issued.expiresInSeconds,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  /**
   * Step 2: verify the code and attach the phone to the current user
   * (phoneVerified = true). Unlike otp/verify this NEVER creates or switches
   * accounts — it only mutates the authenticated user.
   */
  async verifyPhoneAttach(
    userId: string,
    rawPhone: string,
    code: string,
  ): Promise<{ phone: string; phoneVerified: true }> {
    const phone = normalizePhone(rawPhone);
    const ok = await this.otp.verify(phone, code, 'customer_auth');
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Invalid or expired code',
        code: 'OTP_INVALID',
      });
    }

    // Re-check ownership inside the write to close the race window.
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({
        where: { phone, NOT: { id: userId } },
        select: { id: true },
      });
      if (owner) {
        throw new ConflictException({
          message: 'This phone number is already linked to another account',
          code: 'PHONE_TAKEN',
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { phone, phoneVerified: true },
      });
    });

    return { phone, phoneVerified: true };
  }

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
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Invalid or expired code',
        code: 'OTP_INVALID',
      });
    }

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

  /**
   * Self-registration for a customer. Combines the separate dial code and
   * national number into an E.164 `phone`, stores the dial code on its own
   * column, grants the `customer` role, and returns a fresh session so the
   * client is logged in immediately. No password is set — customers sign back
   * in through the phone OTP flow.
   */
  async register(dto: RegisterCustomerDto): Promise<AuthTokensDto> {
    const email = dto.email.trim().toLowerCase();
    const countryCode = dto.countryCode.trim();
    const phone = this.composePhone(countryCode, dto.phone);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        message: 'An account with this email or phone already exists',
        code: 'ACCOUNT_EXISTS',
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          countryCode,
          fullName: dto.fullName,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, role: DbRole.customer },
      });
      return created;
    });

    const tokens = await this.tokens.issueTokens({
      id: user.id,
      email: user.email,
      roles: [Role.CUSTOMER],
      adminLevel: null,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: [Role.CUSTOMER],
        adminLevel: null,
        isVerified: null,
        storeName: null,
      },
    };
  }

  /**
   * Join a separate dial code (+971) and a national number (501234567) into a
   * single E.164 string (+971501234567) for storage and uniqueness checks.
   */
  private composePhone(countryCode: string, nationalNumber: string): string {
    const nationalDigits = nationalNumber.replace(/\D/g, '');
    return normalizePhone(`${countryCode}${nationalDigits}`);
  }

  private syntheticEmailForPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `customer+${digits}@zook.local`;
  }
}

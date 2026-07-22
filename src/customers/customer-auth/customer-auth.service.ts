import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role as DbRole } from '@prisma/client';
import { AuthTokensDto } from '../../auth/dto/auth-tokens.dto';
import { TokenService } from '../../auth/token.service';
import { Role } from '../../common/enums/role.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { PrismaService } from '../../database/prisma.service';
import { OtpService } from '../../otp/otp.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';

/** bcrypt work factor for password hashing. */
const BCRYPT_ROUNDS = 12;

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

  /**
   * Email + password self-registration for a customer. Combines the separate
   * dial code and national number into an E.164 `phone`, stores the dial code
   * on its own column, hashes the password, grants the `customer` role, and
   * returns a fresh session so the client is logged in immediately.
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
      throw new ConflictException(
        'An account with this email or phone already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          countryCode,
          fullName: dto.fullName,
          passwordHash,
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

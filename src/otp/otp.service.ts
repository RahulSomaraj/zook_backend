import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../database/prisma.service';

export interface IssuedOtp {
  expiresInSeconds: number;
  /** Returned only outside production so the flow is testable without SMS. */
  devCode?: string;
}

/**
 * Issues and verifies one-time phone codes. SMS delivery is stubbed for now —
 * the code is logged (and echoed in non-prod) instead of sent. Swap the
 * `deliver()` call for a real SMS provider later without changing callers.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly codeLength = 4; // matches the 4-box OTP UI
  private readonly ttlMs: number;
  private readonly maxAttempts = 5;
  private readonly isProd: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlMs = (config.get<number>('otp.ttlSeconds') ?? 300) * 1000;
    this.isProd = config.get<string>('app.env') === 'production';
  }

  async issue(phone: string, purpose = 'vendor_auth'): Promise<IssuedOtp> {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    // Invalidate any still-active codes for this phone, then store the new one.
    await this.prisma.phoneVerification.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.phoneVerification.create({
      data: { phone, codeHash, purpose, expiresAt },
    });

    this.deliver(phone, code);
    return {
      expiresInSeconds: Math.floor(this.ttlMs / 1000),
      ...(this.isProd ? {} : { devCode: code }),
    };
  }

  async verify(
    phone: string,
    code: string,
    purpose = 'vendor_auth',
  ): Promise<boolean> {
    const record = await this.prisma.phoneVerification.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= this.maxAttempts) return false;

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }

    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }

  private generateCode(): string {
    const max = 10 ** this.codeLength;
    return randomInt(0, max).toString().padStart(this.codeLength, '0');
  }

  /** Stubbed SMS delivery. Replace with a real provider (Twilio/Unifonic/...). */
  private deliver(phone: string, code: string): void {
    this.logger.log(`[stub-sms] OTP for ${phone}: ${code}`);
  }
}

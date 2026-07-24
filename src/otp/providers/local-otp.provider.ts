import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { IssuedOtp, OtpProvider } from './otp-provider.interface';

/**
 * Self-managed OTP: generates a 6-digit code, stores only its bcrypt hash in
 * `phone_verifications`, and (for now) logs it instead of sending SMS. Keeps
 * the original behaviour for audiences not yet on Twilio (vendors). Delivery is
 * intentionally stubbed — the real SMS path is the Twilio Verify provider.
 */
@Injectable()
export class LocalOtpProvider implements OtpProvider {
  readonly name = 'local';

  private readonly logger = new Logger(LocalOtpProvider.name);
  private readonly codeLength = 6;
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

  async issue(phone: string, purpose: string): Promise<IssuedOtp> {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    // Invalidate any still-active codes for this phone/purpose, then store the
    // new one — a single active code at a time narrows brute-force surface.
    await this.prisma.phoneVerification.updateMany({
      where: { phone, purpose, consumedAt: null },
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
    purpose: string,
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

  /** Stubbed SMS delivery for the local provider. Never logs in production. */
  private deliver(phone: string, code: string): void {
    if (this.isProd) {
      this.logger.warn(
        `Local OTP provider active in production for ${phone} — code was NOT sent. Configure Twilio.`,
      );
      return;
    }
    this.logger.log(`[stub-sms] OTP for ${phone}: ${code}`);
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { IssuedOtp, OtpProvider } from './otp-provider.interface';

/**
 * OTP via Twilio Verify. Twilio generates, sends, expires, rate-limits and
 * attempt-caps the code server-side, and applies Fraud Guard / geo-permissions
 * (configured on the Verify service). We never see or store the code.
 *
 * The client is created once (singleton) at module init. Every call is bounded
 * by a timeout so a slow Twilio never ties up a request, and Twilio's internal
 * errors are mapped to clean HTTP responses instead of leaking upstream.
 */
@Injectable()
export class TwilioVerifyProvider implements OtpProvider, OnModuleInit {
  readonly name = 'twilio_verify';

  private readonly logger = new Logger(TwilioVerifyProvider.name);
  private client!: Twilio;
  private serviceSid!: string;
  private ttlSeconds!: number;
  private timeoutMs!: number;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const accountSid = this.config.get<string>('twilio.accountSid');
    const authToken = this.config.get<string>('twilio.authToken');
    this.serviceSid = this.config.get<string>('twilio.verifyServiceSid') ?? '';
    this.ttlSeconds = this.config.get<number>('twilio.verifyTtlSeconds') ?? 600;
    this.timeoutMs = this.config.get<number>('twilio.timeoutMs') ?? 8000;

    if (!accountSid || !authToken || !this.serviceSid) {
      // Should be caught by env validation, but fail loudly if mis-wired.
      throw new Error(
        'TwilioVerifyProvider selected but Twilio credentials are incomplete.',
      );
    }
    this.client = new Twilio(accountSid, authToken, {
      autoRetry: false, // never auto-retry a send: it double-bills and re-SMSes
    });
    // Note: per-call latency is bounded by withTimeout() below, independent of
    // the SDK's own socket timeout.
  }

  async issue(phone: string, purpose: string): Promise<IssuedOtp> {
    try {
      await this.withTimeout(
        this.client.verify.v2
          .services(this.serviceSid)
          .verifications.create({ to: phone, channel: 'sms' }),
        'issue',
      );
      return { expiresInSeconds: this.ttlSeconds };
    } catch (err) {
      this.mapAndThrowIssueError(err, purpose);
    }
  }

  async verify(
    phone: string,
    code: string,
    _purpose: string,
  ): Promise<boolean> {
    try {
      const check = await this.withTimeout(
        this.client.verify.v2
          .services(this.serviceSid)
          .verificationChecks.create({ to: phone, code }),
        'verify',
      );
      return check.status === 'approved';
    } catch (err) {
      const code20404 = this.twilioCode(err) === 20404;
      // 20404 = verification not found: expired, already approved, or too many
      // attempts. That's a normal "invalid/expired" outcome, not an outage.
      if (code20404) return false;
      // Any other failure (network/5xx) — surface as a retryable 503 rather
      // than silently treating a Twilio outage as a wrong code.
      this.logger.error(`Twilio verify check failed: ${this.safeMessage(err)}`);
      throw new ServiceUnavailableException({
        message:
          'Verification service is temporarily unavailable. Please try again.',
        code: 'OTP_SEND_FAILED',
      });
    }
  }

  /** Reject if the Twilio call outlives the configured timeout. */
  private withTimeout<T>(p: Promise<T>, op: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Twilio ${op} timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  private mapAndThrowIssueError(err: unknown, purpose: string): never {
    const code = this.twilioCode(err);
    // 21608: trial accounts may only send to numbers verified in the Twilio
    // console. Surfaced explicitly so testing isn't a mystery 503.
    if (code === 21608) {
      throw new ServiceUnavailableException(
        'This number is not verified for the Twilio trial account. Verify it in the Twilio console or upgrade the account.',
      );
    }
    // 60605 / 21408: destination country blocked by the account's
    // SMS geo-permissions.
    if (code === 60605 || code === 21408) {
      throw new ServiceUnavailableException(
        "SMS to this country is disabled by the Twilio account's geo-permissions. Enable the destination country in the console.",
      );
    }
    // 60200 invalid parameter (bad number), 60033 invalid 'to' number —
    // the caller's number is malformed, so this is a 400, not a 503.
    if (code === 60200 || code === 60033) {
      throw new BadRequestException({
        message:
          'That phone number is not valid. Check the number (including country code) and try again.',
        code: 'PHONE_INVALID',
      });
    }
    // 60203 max send attempts reached, 60205 SMS not supported to landline,
    // 20429 too many requests, or Fraud Guard blocks — treat as rate/abuse.
    if (code === 60203 || code === 20429 || code === 60205) {
      throw new ServiceUnavailableException(
        'Too many attempts for this number. Please wait and try again later.',
      );
    }
    this.logger.error(
      `Twilio verify start failed (purpose=${purpose}): ${this.safeMessage(err)}`,
    );
    throw new ServiceUnavailableException({
      message:
        'Verification service is temporarily unavailable. Please try again.',
      code: 'OTP_SEND_FAILED',
    });
  }

  private twilioCode(err: unknown): number | undefined {
    return typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: number }).code
      : undefined;
  }

  /** Never echo full Twilio error objects (may contain the phone number). */
  private safeMessage(err: unknown): string {
    if (err instanceof Error) return `${err.name}: code=${this.twilioCode(err)}`;
    return 'unknown error';
  }
}

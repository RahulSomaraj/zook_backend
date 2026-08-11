import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPlausiblePhone, normalizePhone } from '../common/utils/phone.util';
import { OtpRateLimiterService } from './otp-rate-limiter.service';
import { LocalOtpProvider } from './providers/local-otp.provider';
import { IssuedOtp, OtpProvider } from './providers/otp-provider.interface';
import { TwilioVerifyProvider } from './providers/twilio-verify.provider';

export type { IssuedOtp } from './providers/otp-provider.interface';

/**
 * Facade over the OTP providers. Picks a provider per purpose from config
 * (customer vs vendor), enforces the per-phone Redis rate limit on send, and
 * normalizes the phone once at the boundary. Callers (customer/vendor auth)
 * keep the same `issue` / `verify` signatures as before — the strategy swap is
 * invisible to them.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly testMode: boolean;
  private readonly customerProviderName: string;
  private readonly vendorProviderName: string;

  constructor(
    private readonly local: LocalOtpProvider,
    private readonly twilio: TwilioVerifyProvider,
    private readonly rateLimiter: OtpRateLimiterService,
    config: ConfigService,
  ) {
    this.testMode = config.get<boolean>('otp.testMode') ?? false;
    this.customerProviderName =
      config.get<string>('otp.customerProvider') ?? 'twilio_verify';
    this.vendorProviderName =
      config.get<string>('otp.vendorProvider') ?? 'local';
  }

  async issue(rawPhone: string, purpose = 'vendor_auth'): Promise<IssuedOtp> {
    const phone = normalizePhone(rawPhone);
    // Reject implausible numbers BEFORE any paid Twilio call. Catches e.g. a
    // foreign number sent without '+', which normalizePhone would otherwise
    // mangle into an invalid +971… string (Twilio error 60200).
    if (!isPlausiblePhone(phone)) {
      throw new BadRequestException({
        message:
          'Invalid phone number. UAE numbers need 9 digits starting with 5 (e.g. +9715…); other countries must include their country code with a +.',
        code: 'PHONE_INVALID',
      });
    }
    // Abuse gate first — never spend a paid send on a throttled number.
    await this.rateLimiter.assertCanSend(phone, purpose);

    const provider = this.providerFor(purpose);
    const issued = await provider.issue(phone, purpose);

    // Only arm the cooldown once the send actually went out.
    await this.rateLimiter.startCooldown(phone, purpose);
    return issued;
  }

  async verify(
    rawPhone: string,
    code: string,
    purpose = 'vendor_auth',
  ): Promise<boolean> {
    const phone = normalizePhone(rawPhone);
    return this.providerFor(purpose).verify(phone, code, purpose);
  }

  /** Map a purpose to its configured provider. Vendor is the safe default. */
  private providerFor(purpose: string): OtpProvider {
    if (this.testMode) return this.local;

    const name =
      purpose === 'customer_auth'
        ? this.customerProviderName
        : this.vendorProviderName;
    return name === 'twilio_verify' ? this.twilio : this.local;
  }
}

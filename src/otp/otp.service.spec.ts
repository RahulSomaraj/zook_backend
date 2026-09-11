import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { OtpRateLimiterService } from './otp-rate-limiter.service';
import { LocalOtpProvider } from './providers/local-otp.provider';
import { TwilioVerifyProvider } from './providers/twilio-verify.provider';

function makeConfig(testMode = false): ConfigService {
  const values: Record<string, unknown> = {
    'otp.testMode': testMode,
    'otp.customerProvider': 'twilio_verify',
    'otp.vendorProvider': 'local',
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('OtpService (provider routing)', () => {
  let local: jest.Mocked<Pick<LocalOtpProvider, 'issue' | 'verify'>>;
  let twilio: jest.Mocked<Pick<TwilioVerifyProvider, 'issue' | 'verify'>>;
  let limiter: jest.Mocked<
    Pick<OtpRateLimiterService, 'assertCanSend' | 'startCooldown'>
  >;
  let svc: OtpService;

  beforeEach(() => {
    local = { issue: jest.fn().mockResolvedValue({ expiresInSeconds: 300 }), verify: jest.fn().mockResolvedValue(true) };
    twilio = { issue: jest.fn().mockResolvedValue({ expiresInSeconds: 600 }), verify: jest.fn().mockResolvedValue(true) };
    limiter = { assertCanSend: jest.fn().mockResolvedValue(undefined), startCooldown: jest.fn().mockResolvedValue(undefined) };
    svc = new OtpService(
      local as unknown as LocalOtpProvider,
      twilio as unknown as TwilioVerifyProvider,
      limiter as unknown as OtpRateLimiterService,
      makeConfig(),
    );
  });

  it('routes customer_auth to Twilio Verify', async () => {
    await svc.issue('0501234567', 'customer_auth');
    expect(twilio.issue).toHaveBeenCalled();
    expect(local.issue).not.toHaveBeenCalled();
  });

  it('routes vendor_auth (default) to the local provider', async () => {
    await svc.issue('0501234567');
    expect(local.issue).toHaveBeenCalled();
    expect(twilio.issue).not.toHaveBeenCalled();
  });

  it('routes every audience locally in OTP test mode', async () => {
    svc = new OtpService(
      local as unknown as LocalOtpProvider,
      twilio as unknown as TwilioVerifyProvider,
      limiter as unknown as OtpRateLimiterService,
      makeConfig(true),
    );

    await svc.issue('+919656082258', 'customer_auth');
    await svc.issue('9656082258', 'vendor_auth');

    expect(local.issue).toHaveBeenNthCalledWith(
      1,
      '+919656082258',
      'customer_auth',
    );
    expect(local.issue).toHaveBeenNthCalledWith(
      2,
      '+9719656082258',
      'vendor_auth',
    );
    expect(twilio.issue).not.toHaveBeenCalled();
  });

  it('enforces the rate limit before sending, and arms cooldown only after', async () => {
    const order: string[] = [];
    limiter.assertCanSend.mockImplementation(async () => { order.push('assert'); });
    twilio.issue.mockImplementation(async () => { order.push('send'); return { expiresInSeconds: 600 }; });
    limiter.startCooldown.mockImplementation(async () => { order.push('cooldown'); });

    await svc.issue('0501234567', 'customer_auth');
    expect(order).toEqual(['assert', 'send', 'cooldown']);
  });

  it('does not send or arm cooldown when the rate limiter rejects', async () => {
    limiter.assertCanSend.mockRejectedValue(new Error('429'));
    await expect(svc.issue('0501234567', 'customer_auth')).rejects.toThrow('429');
    expect(twilio.issue).not.toHaveBeenCalled();
    expect(limiter.startCooldown).not.toHaveBeenCalled();
  });

  it('normalizes the phone to E.164 before routing to a provider', async () => {
    await svc.issue('0501234567', 'customer_auth');
    expect(twilio.issue).toHaveBeenCalledWith('+971501234567', 'customer_auth');
  });

  it('rejects implausible numbers before any provider/limiter call (400)', async () => {
    // An Indian mobile sent without '+91' — normalizePhone would mangle it
    // into +9719656082258 (10 national digits, impossible for UAE).
    await expect(svc.issue('9656082258', 'customer_auth')).rejects.toMatchObject(
      { status: 400 },
    );
    expect(twilio.issue).not.toHaveBeenCalled();
    expect(limiter.assertCanSend).not.toHaveBeenCalled();
  });

  it('accepts properly prefixed foreign numbers (+91…)', async () => {
    await svc.issue('+919656082258', 'customer_auth');
    expect(twilio.issue).toHaveBeenCalledWith('+919656082258', 'customer_auth');
  });
});

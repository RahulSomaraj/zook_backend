import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioVerifyProvider } from './twilio-verify.provider';

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    'twilio.accountSid': 'AC' + '0'.repeat(32),
    'twilio.authToken': 'secret-token',
    'twilio.verifyServiceSid': 'VA' + '0'.repeat(32),
    'twilio.verifyTtlSeconds': 600,
    'twilio.timeoutMs': 8000,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

/** Build a provider with its Twilio client replaced by a controllable fake. */
function providerWith(fake: {
  verifications?: jest.Mock;
  verificationChecks?: jest.Mock;
}): TwilioVerifyProvider {
  const provider = new TwilioVerifyProvider(makeConfig());
  provider.onModuleInit();
  (provider as any).client = {
    verify: {
      v2: {
        services: () => ({
          verifications: { create: fake.verifications ?? jest.fn() },
          verificationChecks: { create: fake.verificationChecks ?? jest.fn() },
        }),
      },
    },
  };
  return provider;
}

describe('TwilioVerifyProvider', () => {
  const phone = '+971501234567';

  it('issue() returns the configured TTL and never a devCode', async () => {
    const provider = providerWith({
      verifications: jest.fn().mockResolvedValue({ status: 'pending' }),
    });
    const res = await provider.issue(phone, 'customer_auth');
    expect(res).toEqual({ expiresInSeconds: 600 });
    expect(res).not.toHaveProperty('devCode');
  });

  it('verify() returns true only when Twilio reports "approved"', async () => {
    const provider = providerWith({
      verificationChecks: jest.fn().mockResolvedValue({ status: 'approved' }),
    });
    await expect(provider.verify(phone, '123456', 'customer_auth')).resolves.toBe(
      true,
    );
  });

  it('verify() returns false for a pending/incorrect check', async () => {
    const provider = providerWith({
      verificationChecks: jest.fn().mockResolvedValue({ status: 'pending' }),
    });
    await expect(provider.verify(phone, '000000', 'customer_auth')).resolves.toBe(
      false,
    );
  });

  it('verify() maps Twilio 20404 (expired/consumed) to false, not an error', async () => {
    const provider = providerWith({
      verificationChecks: jest.fn().mockRejectedValue({ code: 20404 }),
    });
    await expect(provider.verify(phone, '123456', 'customer_auth')).resolves.toBe(
      false,
    );
  });

  it('verify() surfaces a Twilio outage as 503', async () => {
    const provider = providerWith({
      verificationChecks: jest.fn().mockRejectedValue({ code: 20500 }),
    });
    await expect(
      provider.verify(phone, '123456', 'customer_auth'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('issue() maps an invalid-number error to a clean 4xx-style message', async () => {
    const provider = providerWith({
      verifications: jest.fn().mockRejectedValue({ code: 60200 }),
    });
    await expect(
      provider.issue(phone, 'customer_auth'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

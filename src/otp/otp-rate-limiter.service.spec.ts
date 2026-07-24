import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpRateLimiterService } from './otp-rate-limiter.service';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'otp.resendCooldownSeconds': 30,
    'otp.dailyMaxPerPhone': 5,
    ...overrides,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('OtpRateLimiterService', () => {
  const phone = '+971501234567';
  const purpose = 'customer_auth';

  it('fails open (allows send) when Redis is not configured', async () => {
    const svc = new OtpRateLimiterService(null, makeConfig());
    await expect(svc.assertCanSend(phone, purpose)).resolves.toBeUndefined();
    await expect(svc.startCooldown(phone, purpose)).resolves.toBeUndefined();
  });

  it('throws 429 while a cooldown is active', async () => {
    const redis = {
      ttl: jest.fn().mockResolvedValue(18),
      incr: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
    };
    const svc = new OtpRateLimiterService(redis as any, makeConfig());

    await expect(svc.assertCanSend(phone, purpose)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(redis.incr).not.toHaveBeenCalled(); // short-circuits before the cap
  });

  it('increments the daily counter and sets its TTL on the first send', async () => {
    const redis = {
      ttl: jest.fn().mockResolvedValue(-2), // no cooldown
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const svc = new OtpRateLimiterService(redis as any, makeConfig());

    await expect(svc.assertCanSend(phone, purpose)).resolves.toBeUndefined();
    expect(redis.incr).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
  });

  it('throws 429 once the daily cap is exceeded', async () => {
    const redis = {
      ttl: jest.fn().mockResolvedValueOnce(-2).mockResolvedValue(3600),
      incr: jest.fn().mockResolvedValue(6), // dailyMax = 5
      expire: jest.fn(),
      set: jest.fn(),
    };
    const svc = new OtpRateLimiterService(redis as any, makeConfig());

    await expect(svc.assertCanSend(phone, purpose)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('fails open if a Redis command throws', async () => {
    const redis = {
      ttl: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      incr: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
    };
    const svc = new OtpRateLimiterService(redis as any, makeConfig());
    await expect(svc.assertCanSend(phone, purpose)).resolves.toBeUndefined();
  });

  it('arms the cooldown with the configured TTL after a successful send', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const svc = new OtpRateLimiterService(redis as any, makeConfig());
    await svc.startCooldown(phone, purpose);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(phone),
      '1',
      'EX',
      30,
    );
  });
});

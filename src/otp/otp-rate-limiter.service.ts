import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { RedisClient } from '../redis/redis.constants';

/**
 * Per-phone abuse control for OTP sends, enforced in Redis BEFORE any paid
 * send hits Twilio. Two independent limits:
 *
 *   1. Resend cooldown — minimum seconds between two sends to the same number.
 *   2. Daily cap       — max sends per number per rolling UTC day.
 *
 * Keyed on the normalized phone (not IP): IPs are trivially rotated, but the
 * cost and the SMS both land on a specific number. If Redis is unavailable the
 * limiter fails OPEN (allows the send) so a Redis outage can't lock every user
 * out of login — the edge @Throttle guard and Twilio Fraud Guard remain as
 * backstops.
 */
@Injectable()
export class OtpRateLimiterService {
  private readonly logger = new Logger(OtpRateLimiterService.name);
  private readonly cooldownSeconds: number;
  private readonly dailyMax: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    config: ConfigService,
  ) {
    this.cooldownSeconds = config.get<number>('otp.resendCooldownSeconds') ?? 30;
    this.dailyMax = config.get<number>('otp.dailyMaxPerPhone') ?? 5;
  }

  /**
   * Throws 429 if the phone is in cooldown or over its daily cap. Increments
   * the daily counter (so blocked attempts still count against abuse) but does
   * NOT start the cooldown — call {@link startCooldown} only after a send
   * actually succeeds, so a failed Twilio call doesn't lock the user out.
   */
  async assertCanSend(phone: string, purpose: string): Promise<void> {
    if (!this.redis) return; // degraded mode: fail open

    const cooldownKey = this.cooldownKey(phone, purpose);
    const dayKey = this.dailyKey(phone, purpose);

    try {
      const cooldownTtl = await this.redis.ttl(cooldownKey);
      if (cooldownTtl > 0) {
        throw this.tooMany(
          `Please wait ${cooldownTtl}s before requesting another code.`,
          cooldownTtl,
        );
      }

      const count = await this.redis.incr(dayKey);
      if (count === 1) {
        // First send of the day — expire the counter after 24h.
        await this.redis.expire(dayKey, 24 * 60 * 60);
      }
      if (count > this.dailyMax) {
        const retryAfter = (await this.redis.ttl(dayKey)) || 24 * 60 * 60;
        throw this.tooMany(
          'Daily verification limit reached for this number. Try again tomorrow.',
          retryAfter,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err; // real limit hit — propagate
      // Redis command failure: log and fail open.
      this.logger.error(`OTP rate-limit check failed (fail-open): ${errMessage(err)}`);
    }
  }

  /** Arm the resend cooldown after a successful send. Best-effort. */
  async startCooldown(phone: string, purpose: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        this.cooldownKey(phone, purpose),
        '1',
        'EX',
        this.cooldownSeconds,
      );
    } catch (err) {
      this.logger.error(`Failed to set OTP cooldown: ${errMessage(err)}`);
    }
  }

  private cooldownKey(phone: string, purpose: string): string {
    return `otp:cd:${purpose}:${phone}`;
  }

  private dailyKey(phone: string, purpose: string): string {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    return `otp:cnt:${purpose}:${phone}:${day}`;
  }

  private tooMany(message: string, retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

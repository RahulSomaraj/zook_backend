import {
  Global,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisClient } from './redis.constants';

/**
 * Provides a single shared ioredis connection under the REDIS_CLIENT token.
 *
 * When REDIS_URL is unset the provider resolves to `null` so the app still
 * boots (Redis-backed features degrade instead of crashing). The connection is
 * lazy + resilient: a Redis outage must never take the API down, so we cap
 * retries and never let connection errors bubble up as unhandled rejections.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisClient => {
        const logger = new Logger('RedisModule');
        const url = config.get<string>('redis.url');

        if (!url) {
          logger.warn(
            'REDIS_URL not set — OTP cooldown and distributed throttling are disabled (degraded mode).',
          );
          return null;
        }

        const client = new Redis(url, {
          lazyConnect: false,
          enableReadyCheck: true,
          maxRetriesPerRequest: 2,
          // Cap reconnection backoff so a downed Redis doesn't spin hot.
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });

        client.on('error', (err) => {
          // Log, but do not throw: callers already tolerate Redis being down.
          logger.error(`Redis connection error: ${err.message}`);
        });
        client.on('ready', () => logger.log('Redis connected.'));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  /** Close the connection cleanly on SIGTERM/SIGINT so shutdown drains. */
  async onApplicationShutdown(): Promise<void> {
    const client = this.moduleRef.get<RedisClient>(REDIS_CLIENT, {
      strict: false,
    });
    if (client) {
      await client.quit().catch(() => client.disconnect());
    }
  }
}

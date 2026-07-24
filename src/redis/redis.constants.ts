/** DI token for the shared ioredis client. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Injected value when no REDIS_URL is configured. Consumers must treat a null
 * client as "Redis unavailable" and degrade gracefully rather than throw.
 */
export type RedisClient = import('ioredis').Redis | null;

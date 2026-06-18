/**
 * Typed configuration namespaces, consumed via ConfigService.
 * Example: configService.get('app.port', { infer: true })
 */
const isProd = process.env.NODE_ENV === 'production';

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    isProd,
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'log',
    format: process.env.LOG_FORMAT ?? 'pretty',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },
  cors: {
    // Comma-separated allowlist, e.g. "https://admin.zook.ae,https://vendor.zook.ae".
    // Empty in prod means no cross-origin browser access until configured.
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  throttle: {
    // Window in milliseconds and max requests per window, per client IP.
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  swagger: {
    // Explicit env wins; otherwise on outside production, off in production.
    enabled:
      process.env.SWAGGER_ENABLED !== undefined
        ? process.env.SWAGGER_ENABLED === 'true'
        : !isProd,
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
});

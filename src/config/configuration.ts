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
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  oauth: {
    // Comma-separated allowlists of accepted token audiences (client IDs).
    google: {
      clientIds: (process.env.GOOGLE_CLIENT_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    apple: {
      // Apple "audience" = your app's bundle ID and/or Services ID.
      clientIds: (process.env.APPLE_CLIENT_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
  supabase: {
    // Base project URL, e.g. https://<ref>.supabase.co. Used to derive the
    // token issuer (`${url}/auth/v1`) and the JWKS endpoint for verification.
    url: process.env.SUPABASE_URL,
    // Legacy HS256 projects: the project JWT secret. Newer projects sign
    // asymmetrically (ES256/RS256) and are verified via JWKS instead — leave
    // this empty in that case.
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
    // Service-role key for server-side Storage operations (minting signed
    // upload/download URLs). Bypasses RLS — SERVER ONLY, never sent to clients.
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Optional dedicated storage host for faster large uploads, e.g.
    // https://<ref>.storage.supabase.co. Falls back to `url` when unset.
    storageUrl: process.env.SUPABASE_STORAGE_URL || process.env.SUPABASE_URL,
  },
  admin: {
    // Comma-separated allowlist of emails granted the `admin` role on Supabase
    // sign-in. Authoritative: a client can never self-assign admin, so this is
    // also how the very first admin is bootstrapped (no seed needed).
    emails: (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
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

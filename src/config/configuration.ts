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
  redis: {
    // Connection URL, e.g. redis://:password@host:6379/0 (rediss:// for TLS).
    // When empty, Redis-backed features (OTP cooldown, distributed throttling)
    // fall back to safe degraded behaviour instead of crashing.
    url: process.env.REDIS_URL ?? '',
  },
  otp: {
    // Development/test-only switch: route every OTP audience through the local
    // provider so arbitrary valid phone numbers can exercise signup/login
    // without relying on Twilio's verified-recipient restrictions.
    testMode: process.env.OTP_TEST_MODE === 'true',
    // Local (self-managed) code lifetime, in seconds. Only used by the local
    // provider; the Twilio Verify provider owns its own TTL server-side.
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
    // Which delivery provider each audience uses: 'twilio_verify' | 'local'.
    customerProvider: process.env.OTP_CUSTOMER_PROVIDER ?? 'twilio_verify',
    vendorProvider: process.env.OTP_VENDOR_PROVIDER ?? 'local',
    // Per-phone abuse controls (enforced in Redis, before any paid send).
    resendCooldownSeconds: parseInt(
      process.env.OTP_RESEND_COOLDOWN_SECONDS ?? '30',
      10,
    ),
    dailyMaxPerPhone: parseInt(process.env.OTP_DAILY_MAX_PER_PHONE ?? '5', 10),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    // Verify service SID (VAxx…). Configure code length (6) + channel in the
    // Twilio console; enable Fraud Guard + geo-permissions there too.
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? '',
    // Displayed to the client for countdown UI. Match the Verify service TTL
    // (Twilio default is 10 minutes).
    verifyTtlSeconds: parseInt(
      process.env.TWILIO_VERIFY_TTL_SECONDS ?? '600',
      10,
    ),
    // Network timeout (ms) for calls to the Twilio API.
    timeoutMs: parseInt(process.env.TWILIO_TIMEOUT_MS ?? '8000', 10),
  },
  firebase: {
    // Service-account JSON (stringify the downloaded .json file into one line).
    // Required for FCM push. When absent, FcmPushSender logs a warning and skips.
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
  },
  payments: {
    // Mamo Pay processing-fee rate applied to each sale, as a fraction (0.029 =
    // 2.9%). Snapshotted into each sub-order's processing_fee at sale time so
    // historical payouts don't move if the rate later changes. See payout.util.
    mamoFeeRate: parseFloat(process.env.MAMO_FEE_RATE ?? '0.029'),
  },
  jeebly: {
    env: process.env.JEEBLY_ENV ?? 'demo',
    apiKey: process.env.JEEBLY_API_KEY ?? '',
    clientKey: process.env.JEEBLY_CLIENT_KEY ?? '',
    demoBaseUrl: process.env.JEEBLY_DEMO_BASE_URL ?? 'https://demo.jeebly.com',
    productionBaseUrl:
      process.env.JEEBLY_PRODUCTION_BASE_URL ?? 'https://myjeebly.jeebly.com',
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

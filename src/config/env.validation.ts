import * as Joi from 'joi';

/**
 * Validates process.env at boot. The app refuses to start if required
 * configuration is missing or malformed.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
  LOG_FORMAT: Joi.string().valid('pretty', 'json').default('pretty'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  DIRECT_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).optional(),

  // Auth: secret used to sign/verify our own JWTs.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // Social sign-in: comma-separated accepted client IDs (token audiences).
  // Optional until the providers are configured.
  GOOGLE_CLIENT_IDS: Joi.string().allow('').optional(),
  APPLE_CLIENT_IDS: Joi.string().allow('').optional(),

  // Supabase Auth: project URL is required to derive the token issuer + JWKS.
  // The JWT secret is only needed for legacy HS256 projects. Both optional
  // until Supabase sign-in is enabled.
  SUPABASE_URL: Joi.string().uri().optional(),
  SUPABASE_JWT_SECRET: Joi.string().allow('').optional(),

  // Supabase Storage: service-role key for minting signed upload/download URLs
  // (server-only). Optional until Storage signing is enabled; required at
  // runtime by StorageService when a signed URL is actually requested.
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().allow('').optional(),
  // Optional dedicated storage host (https://<ref>.storage.supabase.co).
  SUPABASE_STORAGE_URL: Joi.string().uri().optional(),

  // Comma-separated emails granted the admin role on Supabase sign-in.
  // Optional; empty = no admins provisioned via the allowlist.
  ADMIN_EMAILS: Joi.string().allow('').optional(),

  // Comma-separated CORS allowlist. Optional; empty = no cross-origin access.
  CORS_ORIGINS: Joi.string().allow('').optional(),

  // Rate limiting: window (ms) and max requests per window per IP.
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Redis connection URL (redis:// or rediss://). Backs the per-phone OTP
  // cooldown/daily-cap and, when present, distributed request throttling.
  // Optional: when unset those features degrade safely instead of crashing.
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).allow('').optional(),

  // OTP delivery provider selection per audience.
  // Test mode is intentionally forbidden in production because the local
  // provider returns the OTP in the API response outside production.
  OTP_TEST_MODE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.valid(false).default(false),
    otherwise: Joi.boolean().default(false),
  }),
  OTP_CUSTOMER_PROVIDER: Joi.string()
    .valid('twilio_verify', 'local')
    .default('twilio_verify'),
  OTP_VENDOR_PROVIDER: Joi.string()
    .valid('twilio_verify', 'local')
    .default('local'),
  OTP_TTL_SECONDS: Joi.number().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().default(30),
  OTP_DAILY_MAX_PER_PHONE: Joi.number().default(5),

  // Twilio — each credential is required when EITHER audience uses
  // 'twilio_verify'. Two chained .when()s give the logical OR: if either
  // provider is Twilio, the value must be a non-empty string.
  TWILIO_ACCOUNT_SID: Joi.when('OTP_TEST_MODE', {
    is: true,
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string()
      .allow('')
      .when('OTP_CUSTOMER_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().pattern(/^AC[0-9a-fA-F]{32}$/).required(),
      })
      .when('OTP_VENDOR_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().pattern(/^AC[0-9a-fA-F]{32}$/).required(),
      }),
  }),
  TWILIO_AUTH_TOKEN: Joi.when('OTP_TEST_MODE', {
    is: true,
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string()
      .allow('')
      .when('OTP_CUSTOMER_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().min(1).required(),
      })
      .when('OTP_VENDOR_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().min(1).required(),
      }),
  }),
  TWILIO_VERIFY_SERVICE_SID: Joi.when('OTP_TEST_MODE', {
    is: true,
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string()
      .allow('')
      .when('OTP_CUSTOMER_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().pattern(/^VA[0-9a-fA-F]{32}$/).required(),
      })
      .when('OTP_VENDOR_PROVIDER', {
        is: 'twilio_verify',
        then: Joi.string().pattern(/^VA[0-9a-fA-F]{32}$/).required(),
      }),
  }),
  TWILIO_VERIFY_TTL_SECONDS: Joi.number().default(600),
  TWILIO_TIMEOUT_MS: Joi.number().default(8000),

  // Firebase service-account JSON (stringified). Required for FCM push;
  // when absent the sender degrades gracefully (logs a warning, skips push).
  FIREBASE_SERVICE_ACCOUNT: Joi.string().allow('').optional(),

  // Mamo Pay processing-fee rate as a fraction (0.029 = 2.9%). Used to compute
  // the gateway cut on each payout. Defaults to 2.9% when unset.
  MAMO_FEE_RATE: Joi.number().min(0).max(1).default(0.029),

  // Leave unset to default Swagger on outside production and off in production.
  SWAGGER_ENABLED: Joi.boolean().optional(),
  SWAGGER_PATH: Joi.string().default('docs'),
});

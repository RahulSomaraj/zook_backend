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

  // Comma-separated emails granted the admin role on Supabase sign-in.
  // Optional; empty = no admins provisioned via the allowlist.
  ADMIN_EMAILS: Joi.string().allow('').optional(),

  // Comma-separated CORS allowlist. Optional; empty = no cross-origin access.
  CORS_ORIGINS: Joi.string().allow('').optional(),

  // Rate limiting: window (ms) and max requests per window per IP.
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Leave unset to default Swagger on outside production and off in production.
  SWAGGER_ENABLED: Joi.boolean().optional(),
  SWAGGER_PATH: Joi.string().default('docs'),
});

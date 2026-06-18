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

  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_JWT_SECRET: Joi.string().required(),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('docs'),
});

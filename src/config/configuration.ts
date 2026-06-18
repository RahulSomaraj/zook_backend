/**
 * Typed configuration namespaces, consumed via ConfigService.
 * Example: configService.get('app.port', { infer: true })
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    isProd: process.env.NODE_ENV === 'production',
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
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
});

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

/**
 * Authentication wiring. Phase 1 only verifies Supabase-issued JWTs and exposes
 * the strategy used by the global JwtAuthGuard. Login/register/OTP endpoints
 * are added in Phase 0/auth work.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}

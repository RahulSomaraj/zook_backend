import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { SocialAuthService } from './social/social-auth.service';
import { SupabaseTokenVerifier } from './social/supabase-token.verifier';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Signing options are passed per-call in TokenService, so no static config here.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    SupabaseTokenVerifier,
    SocialAuthService,
  ],
  exports: [
    AuthService,
    TokenService,
    JwtStrategy,
    PassportModule,
    SocialAuthService,
  ],
})
export class AuthModule {}

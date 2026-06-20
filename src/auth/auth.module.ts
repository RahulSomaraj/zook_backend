import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../database/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OAuthVerifierService } from './oauth-verifier.service';
import { TokenService } from './token.service';

/**
 * Authentication — fully self-contained against Postgres.
 *
 * - Email/password accounts: hashes (bcrypt) live in the `users` table.
 * - Sessions: the app signs/verifies its own JWTs (TokenService + JwtStrategy).
 * - Google/Apple: provider id_tokens are verified server-side
 *   (OAuthVerifierService) and linked via the `auth_identities` table.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, TokenService, OAuthVerifierService, AuthService],
  exports: [PassportModule],
})
export class AuthModule {}

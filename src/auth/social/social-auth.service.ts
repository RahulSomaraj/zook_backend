import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider as DbAuthProvider, Role as DbRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth.service';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { SupabaseTokenVerifier } from './supabase-token.verifier';

/** Minimal user shape the linking logic needs (kept narrow so the various
 *  Prisma payload types from create/find/link all assign cleanly). */
interface SocialUser {
  id: string;
  emailVerified: boolean;
  userRoles: { role: DbRole }[];
}

export interface SocialLoginResult {
  tokens: AuthTokensDto;
  isNewUser: boolean;
}

/**
 * Authenticates a user from a verified Supabase social token and issues our own
 * session. Linking rules (security-critical):
 *   - Match first on the stored (provider, providerUserId) identity.
 *   - Otherwise link to an existing user ONLY by a provider-verified email.
 *   - Never link on an unverified email (account-takeover vector).
 *
 * Grants the customer role on sign-in (anyone may shop). Social login is
 * customer-only; vendors onboard through the phone-OTP + store/KYC flow.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: SupabaseTokenVerifier,
    private readonly auth: AuthService,
  ) {}

  async authenticate(
    supabaseAccessToken: string,
  ): Promise<SocialLoginResult> {
    const identity = await this.verifier.verify(supabaseAccessToken);

    if (!identity.email || !identity.emailVerified) {
      // Google always returns a verified email; anything else we won't trust
      // for account creation/linking.
      throw new UnauthorizedException({
        message: 'A verified email is required for social sign-in.',
        code: 'SOCIAL_EMAIL_UNVERIFIED',
      });
    }

    const provider = this.mapProvider(identity.provider);

    const { userId, isNewUser } = await this.prisma.$transaction(
      async (tx) => {
        const existingIdentity = await tx.authIdentity.findUnique({
          where: {
            provider_providerUserId: {
              provider,
              providerUserId: identity.providerUserId,
            },
          },
          include: { user: { include: { userRoles: true } } },
        });

        let user: SocialUser | null = existingIdentity?.user ?? null;
        let created = false;

        if (!user) {
          // No identity yet — link by verified email, else create a new user.
          const byEmail = await tx.user.findUnique({
            where: { email: identity.email! },
            include: { userRoles: true },
          });

          if (byEmail) {
            user = byEmail;
            if (!byEmail.emailVerified) {
              await tx.user.update({
                where: { id: byEmail.id },
                data: { emailVerified: true },
              });
            }
          } else {
            const createdUser = await tx.user.create({
              data: {
                email: identity.email!,
                emailVerified: true,
                fullName: identity.fullName,
                avatarUrl: identity.avatarUrl,
              },
              include: { userRoles: true },
            });
            user = createdUser;
            created = true;
          }

          await tx.authIdentity.create({
            data: {
              userId: user.id,
              provider,
              providerUserId: identity.providerUserId,
            },
          });
        }

        // Grant the customer role (idempotent).
        const hasCustomer = user.userRoles.some(
          (r) => r.role === DbRole.customer,
        );
        if (!hasCustomer) {
          await tx.userRole.create({
            data: { userId: user.id, role: DbRole.customer },
          });
        }

        return { userId: user.id, isNewUser: created };
      },
    );

    const tokens = await this.auth.issueSession(userId);
    return { tokens, isNewUser };
  }

  private mapProvider(provider: string): DbAuthProvider {
    switch (provider) {
      case 'google':
        return DbAuthProvider.google;
      case 'apple':
        return DbAuthProvider.apple;
      default:
        return DbAuthProvider.supabase;
    }
  }
}

import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../database/prisma.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthSignInDto } from './dto/oauth-signin.dto';
import { SupabaseSignInDto } from './dto/supabase-signin.dto';
import { SignupCustomerDto } from './dto/signup-customer.dto';
import { SignupVendorDto } from './dto/signup-vendor.dto';
import { IssuedTokens, TokenService } from './token.service';
import {
  OAuthVerifierService,
  type VerifiedIdentity,
} from './oauth-verifier.service';
import { SupabaseAuthService } from './supabase.service';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  fullName?: string | null;
}

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Verified emails granted the admin role on social sign-in (lowercased). */
  private readonly adminEmails: ReadonlySet<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly oauth: OAuthVerifierService,
    private readonly supabase: SupabaseAuthService,
    config: ConfigService,
  ) {
    this.adminEmails = new Set(config.get<string[]>('admin.emails') ?? []);
  }

  // ── Email / password ─────────────────────────────────────────────────────

  signupCustomer(dto: SignupCustomerDto): Promise<AuthResult> {
    return this.signupWithPassword(dto, Role.CUSTOMER);
  }

  /**
   * Vendor signup. Same account creation as a customer but with the `vendor`
   * role. Store profile + KYC are submitted separately via POST /vendors/apply.
   */
  signupVendor(dto: SignupVendorDto): Promise<AuthResult> {
    return this.signupWithPassword(dto, Role.VENDOR);
  }

  /**
   * Create a new admin. The caller must already be an admin (enforced in the
   * controller via @Roles(ADMIN)). No tokens are returned — the new admin logs
   * in themselves.
   */
  async createAdmin(dto: CreateAdminDto): Promise<PublicUser> {
    await this.ensureEmailFree(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        emailVerified: true,
        role: Role.ADMIN,
      },
    });
    this.logger.log(`Admin account created: ${user.email}`);
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.passwordHash) {
      // Either no account, or a social-only account with no password set.
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueFor(this.toPublicUser(user));
  }

  // ── Google / Apple ───────────────────────────────────────────────────────

  signInWithGoogle(dto: OAuthSignInDto): Promise<AuthResult> {
    return this.signInWithProvider(AuthProvider.google, dto);
  }

  signInWithApple(dto: OAuthSignInDto): Promise<AuthResult> {
    return this.signInWithProvider(AuthProvider.apple, dto);
  }

  /**
   * Verify a provider id_token, then find-or-create the matching user and link
   * the identity. Linking rules:
   *  - Known (provider, sub) → log that user in.
   *  - Otherwise, if the verified email already has an account → link to it.
   *  - Otherwise create a fresh account with the requested role (customer or
   *    vendor; defaults to customer).
   */
  private async signInWithProvider(
    provider: AuthProvider,
    dto: OAuthSignInDto,
  ): Promise<AuthResult> {
    const identity = await this.oauth.verify(provider, dto.idToken);
    return this.issueForIdentity(identity, dto.role);
  }

  // ── Supabase ─────────────────────────────────────────────────────────────

  /**
   * Sign in / sign up via Supabase. The client completes the Google handshake
   * through Supabase and sends us the resulting access_token; we verify it and
   * apply the same find-or-create + link rules as the native providers, with
   * the Supabase user id as the linking subject.
   */
  async signInWithSupabase(dto: SupabaseSignInDto): Promise<AuthResult> {
    const identity = await this.supabase.verify(dto.accessToken);
    return this.issueForIdentity(identity, dto.role);
  }

  /**
   * Shared identity resolution for all social providers. Linking rules:
   *  - Known (provider, sub) → log that user in.
   *  - Otherwise, if the verified email already has an account → link to it.
   *  - Otherwise create a fresh account with the requested role (customer or
   *    vendor; defaults to customer).
   *
   * The admin allowlist (ADMIN_EMAILS) is authoritative and overrides the
   * requested role: any verified email on it is granted `admin`, and a
   * pre-existing non-admin account whose owner is later added is promoted on
   * their next sign-in. Demotion is never automatic — see {@link reconcileAdmin}.
   */
  private async issueForIdentity(
    identity: VerifiedIdentity,
    role?: Role.CUSTOMER | Role.VENDOR,
  ): Promise<AuthResult> {
    const { provider } = identity;
    const email = identity.email?.toLowerCase();
    const isAdmin = !!email && this.adminEmails.has(email);

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: true },
    });
    if (existingIdentity) {
      const user = await this.reconcileAdmin(existingIdentity.user, isAdmin);
      return this.issueFor(this.toPublicUser(user));
    }

    const desiredRole: Role = isAdmin ? Role.ADMIN : (role ?? Role.CUSTOMER);

    const user = await this.prisma.$transaction(async (tx) => {
      // Link to an existing account with the same verified email, if any.
      const linkTo = email
        ? await tx.user.findUnique({ where: { email } })
        : null;

      let target =
        linkTo ??
        (await tx.user.create({
          data: {
            email: email ?? `${identity.providerUserId}@${provider}.zook`,
            fullName: identity.fullName,
            emailVerified: identity.emailVerified,
            role: desiredRole,
          },
        }));

      // Promote a pre-existing linked account if its owner is now allowlisted.
      if (linkTo && isAdmin && (target.role as Role) !== Role.ADMIN) {
        target = await tx.user.update({
          where: { id: target.id },
          data: { role: Role.ADMIN },
        });
      }

      await tx.authIdentity.create({
        data: {
          userId: target.id,
          provider,
          providerUserId: identity.providerUserId,
        },
      });
      return target;
    });

    return this.issueFor(this.toPublicUser(user));
  }

  /**
   * Promote a returning user to admin if their email is now on the allowlist.
   * Demotion is intentionally NOT automatic: revoking admin is a deliberate act,
   * not a side effect of an empty/misconfigured allowlist.
   */
  private async reconcileAdmin(user: User, isAdmin: boolean): Promise<User> {
    if (isAdmin && (user.role as Role) !== Role.ADMIN) {
      this.logger.log(`Granting admin via allowlist: ${user.id}`);
      return this.prisma.user.update({
        where: { id: user.id },
        data: { role: Role.ADMIN },
      });
    }
    return user;
  }

  // ── Refresh ──────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<AuthResult> {
    const userId = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.issueFor(this.toPublicUser(user));
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async signupWithPassword(
    dto: SignupCustomerDto,
    role: Role,
  ): Promise<AuthResult> {
    await this.ensureEmailFree(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        fullName: dto.fullName,
        passwordHash,
        role,
      },
    });
    return this.issueFor(this.toPublicUser(user));
  }

  private async ensureEmailFree(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
  }

  private async issueFor(user: PublicUser): Promise<AuthResult> {
    const tokens = await this.tokens.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user, tokens };
  }

  private toPublicUser(u: {
    id: string;
    email: string;
    role: string;
    fullName?: string | null;
  }): PublicUser {
    // Prisma types `role` as a string-literal union; surface it as the app enum.
    return { id: u.id, email: u.email, role: u.role as Role, fullName: u.fullName };
  }
}

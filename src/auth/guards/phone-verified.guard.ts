import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Blocks an action until the authenticated user has a verified phone. Used to
 * gate checkout so social-signup customers (who arrive without a phone) verify
 * one via the OTP flow before their first order. Must run after JwtAuthGuard
 * (which populates req.user).
 *
 * On failure returns 403 with a machine-readable `error` code the client can
 * branch on to launch the OTP screen, then retry.
 */
@Injectable()
export class PhoneVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Authentication required.');
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { phoneVerified: true },
    });

    if (!record?.phoneVerified) {
      throw new ForbiddenException({
        message: 'Verify your phone number to continue.',
        error: 'PHONE_VERIFICATION_REQUIRED',
        code: 'PHONE_VERIFICATION_REQUIRED',
      });
    }
    return true;
  }
}

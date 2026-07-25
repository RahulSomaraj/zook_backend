import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PhoneVerifiedGuard } from './phone-verified.guard';

function ctxFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PhoneVerifiedGuard', () => {
  it('allows the request when the user has a verified phone', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ phoneVerified: true }) },
    } as any;
    const guard = new PhoneVerifiedGuard(prisma);
    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);
  });

  it('blocks with PHONE_VERIFICATION_REQUIRED when phone is not verified', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ phoneVerified: false }) },
    } as any;
    const guard = new PhoneVerifiedGuard(prisma);

    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toMatchObject({
      response: { error: 'PHONE_VERIFICATION_REQUIRED' },
    });
    await expect(
      guard.canActivate(ctxFor({ id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when there is no authenticated user', async () => {
    const prisma = { user: { findUnique: jest.fn() } } as any;
    const guard = new PhoneVerifiedGuard(prisma);
    await expect(guard.canActivate(ctxFor(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

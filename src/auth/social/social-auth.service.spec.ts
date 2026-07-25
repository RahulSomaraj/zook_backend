import { UnauthorizedException } from '@nestjs/common';
import { SocialAuthService } from './social-auth.service';
import { VerifiedSocialIdentity } from './supabase-token.verifier';

const IDENTITY: VerifiedSocialIdentity = {
  providerUserId: 'sb-1',
  email: 'aisha@example.com',
  emailVerified: true,
  provider: 'google',
  fullName: 'Aisha',
  avatarUrl: null,
};

/** Build a fake Prisma whose $transaction runs the callback against `tx`. */
function prismaWith(tx: any) {
  return {
    $transaction: jest.fn((cb: (t: any) => Promise<unknown>) => cb(tx)),
  } as any;
}

function makeTx(over: Partial<Record<string, any>> = {}) {
  return {
    authIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u-new', userRoles: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
    userRole: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

function makeService(tx: any, verify = IDENTITY) {
  const verifier = { verify: jest.fn().mockResolvedValue(verify) } as any;
  const auth = {
    issueSession: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  } as any;
  const svc = new SocialAuthService(prismaWith(tx), verifier, auth);
  return { svc, verifier, auth, tx };
}

describe('SocialAuthService', () => {
  it('creates a new customer, grants the customer role, and issues a session', async () => {
    const tx = makeTx();
    const { svc, auth } = makeService(tx);

    const res = await svc.authenticate('token');

    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.authIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'u-new', provider: 'google', providerUserId: 'sb-1' },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'u-new', role: 'customer' },
    });
    expect(auth.issueSession).toHaveBeenCalledWith('u-new');
    expect(res.isNewUser).toBe(true);
  });

  it('links to an existing user by verified email instead of creating a duplicate', async () => {
    const tx = makeTx({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u-existing', emailVerified: false, userRoles: [] }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const { svc, tx: t } = makeService(tx);

    const res = await svc.authenticate('token');

    expect(t.user.create).not.toHaveBeenCalled();
    expect(t.authIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'u-existing', provider: 'google', providerUserId: 'sb-1' },
    });
    expect(t.user.update).toHaveBeenCalled(); // flips emailVerified true
    expect(res.isNewUser).toBe(false);
  });

  it('reuses the linked user when the identity already exists', async () => {
    const tx = makeTx({
      authIdentity: {
        findUnique: jest.fn().mockResolvedValue({
          user: { id: 'u-2', userRoles: [{ role: 'customer' }] },
        }),
        create: jest.fn(),
      },
    });
    const { svc, auth, tx: t } = makeService(tx);

    await svc.authenticate('token');

    expect(t.authIdentity.create).not.toHaveBeenCalled();
    expect(t.userRole.create).not.toHaveBeenCalled(); // already a customer
    expect(auth.issueSession).toHaveBeenCalledWith('u-2');
  });

  it('rejects a token whose email is not provider-verified', async () => {
    const tx = makeTx();
    const { svc } = makeService(tx, { ...IDENTITY, emailVerified: false });

    await expect(svc.authenticate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});

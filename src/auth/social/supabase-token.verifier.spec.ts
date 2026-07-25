import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { SupabaseTokenVerifier } from './supabase-token.verifier';

const URL_BASE = 'https://proj.supabase.co';
const SECRET = 'unit-test-supabase-jwt-secret-0123456789';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'supabase.url': URL_BASE,
    'supabase.jwtSecret': SECRET, // forces the HS256 path (no network)
    ...overrides,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

async function makeToken(
  claims: Record<string, unknown>,
  opts: { issuer?: string; audience?: string; exp?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.issuer ?? `${URL_BASE}/auth/v1`)
    .setAudience(opts.audience ?? 'authenticated')
    .setSubject((claims.sub as string) ?? 'sb-user-1')
    .setExpirationTime(opts.exp ?? '5m')
    .sign(new TextEncoder().encode(SECRET));
}

describe('SupabaseTokenVerifier', () => {
  it('verifies a valid Google-via-Supabase token and normalizes the identity', async () => {
    const verifier = new SupabaseTokenVerifier(config());
    const token = await makeToken({
      sub: 'sb-user-1',
      email: 'Aisha@Example.com',
      app_metadata: { provider: 'google' },
      user_metadata: { email_verified: true, full_name: 'Aisha R', avatar_url: 'http://img' },
    });

    const id = await verifier.verify(token);
    expect(id).toEqual({
      providerUserId: 'sb-user-1',
      email: 'aisha@example.com',
      emailVerified: true,
      provider: 'google',
      fullName: 'Aisha R',
      avatarUrl: 'http://img',
    });
  });

  it('rejects a token with the wrong issuer', async () => {
    const verifier = new SupabaseTokenVerifier(config());
    const token = await makeToken(
      { sub: 'x', email: 'a@b.com' },
      { issuer: 'https://evil.example.com/auth/v1' },
    );
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const verifier = new SupabaseTokenVerifier(config());
    const token = await makeToken(
      { sub: 'x', email: 'a@b.com' },
      { exp: '-1m' },
    );
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when social login is not configured', async () => {
    const verifier = new SupabaseTokenVerifier(
      config({ 'supabase.url': '', 'supabase.jwtSecret': '' }),
    );
    await expect(verifier.verify('whatever')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

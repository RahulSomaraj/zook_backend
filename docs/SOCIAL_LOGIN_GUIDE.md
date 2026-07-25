# Social Login (Google via Supabase) — integration guide

**Customers** can sign in with Google (customer-only by design; vendors onboard
through the phone-OTP + store/KYC flow). The client authenticates with Google
**through Supabase**, then sends the Supabase access token to our backend, which
verifies it and issues our own session JWTs (same `AuthTokensDto` as every other
login).

## Prerequisites (one-time, in Supabase)

1. Supabase → **Authentication → Providers → Google**: enable it and add your
   Google OAuth client ID/secret.
2. Backend `.env`: set `SUPABASE_URL`. Set `SUPABASE_JWT_SECRET` only if your
   project is a legacy HS256 project; asymmetric projects are verified via JWKS
   automatically.

## Client flow

1. Client uses the Supabase SDK to sign in with Google
   (`supabase.auth.signInWithOAuth({ provider: 'google' })`).
2. Client reads the resulting **Supabase access token**
   (`session.access_token`).
3. Client POSTs it to our endpoint below and stores the returned tokens.

## Endpoint

`POST /api/auth/customer/social/google` — takes `{ "supabaseAccessToken": "<jwt>" }`.

Signs in or signs up a customer. Auto-creates the account on first login and
grants the `customer` role. Response `data`:

```json
{
  "status": "authenticated",
  "tokens": { /* AuthTokensDto: accessToken, refreshToken, tokenType, expiresIn, user */ },
  "isNewUser": true
}
```

- A brand-new social customer has **no phone yet**. They can browse immediately;
  the phone is only required at checkout (see "Phone gate" below).
- Rate limited to 10/min per IP.

## Account linking rules (backend)

- Match first on the stored `(provider, providerUserId)` in `auth_identities`.
- Otherwise link to an existing user **only by a provider-verified email**
  (Google emails are always verified). Never links on an unverified email — that
  would be an account-takeover vector.
- Otherwise a new `User` is created (`email`, `emailVerified: true`, no phone).

So a customer who first signed up by phone-OTP and later "Continue with Google"
using the same email lands on the **same account** (a new `auth_identities` row
is added), not a duplicate.

## Phone gate (Option A)

Social signups have no phone. The `PhoneVerifiedGuard` is applied to
`POST /api/customers/orders/checkout`:

- If `phoneVerified` is false → `403` with body `error: "PHONE_VERIFICATION_REQUIRED"`.
- The client then runs the existing OTP flow (`/api/auth/customer/otp/send` →
  `/otp/verify`, which sets `phoneVerified = true`) and retries checkout.

This keeps signup frictionless while guaranteeing a verified phone before the
first order (when delivery actually needs it).

## Error cases

| Situation | Status | Notes |
|---|---|---|
| Missing/expired/invalid Supabase token | `401` | `Invalid or expired social token.` |
| Wrong issuer / audience | `401` | Signature or claim check failed |
| Token email not verified | `401` | `A verified email is required for social sign-in.` |
| Social login not configured (`SUPABASE_URL` unset) | `401` | `Social login is not configured.` |
| Checkout without verified phone | `403` | `error: PHONE_VERIFICATION_REQUIRED` |

## Vendors

Social login is **customer-only**. Vendors sign up and sign in through the
phone-OTP flow (`/api/auth/vendor/otp/*` + `/api/auth/vendor/register`), which
ties into the store/KYC onboarding and guarantees the verified phone vendors
need for payouts. There is no vendor Google endpoint.

# Customer OTP via Twilio Verify — setup & operations

This backend now delivers customer login/signup OTPs through **Twilio Verify**,
behind a pluggable provider so vendors can adopt it later without code changes.

## What changed

- `src/otp/providers/otp-provider.interface.ts` — the `OtpProvider` contract.
- `src/otp/providers/local-otp.provider.ts` — the original self-managed,
  bcrypt-hashed, Postgres-backed 6-digit code flow (now used by **vendors**).
- `src/otp/providers/twilio-verify.provider.ts` — Twilio Verify (used by
  **customers**). Twilio owns code generation, delivery, expiry, attempt caps
  and Fraud Guard. We never see or store the code.
- `src/otp/otp.service.ts` — thin façade; picks a provider per purpose from
  config, normalizes the phone once, and enforces the per-phone rate limit.
- `src/otp/otp-rate-limiter.service.ts` — Redis per-phone **resend cooldown +
  daily cap**, enforced before any paid send. Fails open if Redis is down.
- `src/redis/*` — shared ioredis client (`REDIS_CLIENT`), global, resilient.
- Customer `otp/send` and `otp/verify` are now **rate-limited** (`@Throttle`).
- Customer + vendor verify DTOs moved from **4 → 6 digits**.

No database migration is required — the `phone_verifications` table is unchanged
and is still used by the local (vendor) provider.

## 1. Install dependencies

```bash
npm install        # picks up twilio + ioredis added to package.json
npm run build      # confirm the project type-checks and compiles
npm test           # runs the new OTP unit tests
```

## 2. Environment variables

Copy from `.env.example`. Required for the customer flow:

```
REDIS_URL=rediss://:<key>@<host>:6380          # Azure Cache for Redis uses TLS (rediss://)
OTP_CUSTOMER_PROVIDER=twilio_verify
OTP_VENDOR_PROVIDER=local
OTP_RESEND_COOLDOWN_SECONDS=30
OTP_DAILY_MAX_PER_PHONE=5
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=<auth token or API key secret>
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_VERIFY_TTL_SECONDS=600
```

The app fails fast at boot (Joi) if a Twilio provider is selected but any
Twilio credential is missing or malformed.

## 3. Twilio console configuration (do these in the Verify service)

1. **Verify → Services → your service:** set **Code length = 6**, channel SMS.
2. Enable **Fraud Guard** (blocks SMS-pumping / toll-fraud number ranges).
3. Set **Geo-permissions** to only the countries you serve (UAE + others as
   needed) so premium-rate destinations are rejected upstream.
4. Prefer a scoped **API key** over the raw Auth Token for production.

## 4. Security controls in place

- Per-phone **resend cooldown** and **daily cap** in Redis (keyed on the number,
  not IP) before any paid send — the primary abuse control.
- Per-IP `@Throttle` on `otp/send` (3/min) and `otp/verify` (6/min) as an edge
  backstop against floods and brute force.
- Twilio Fraud Guard + geo-permissions upstream.
- 6-digit codes (1,000,000 combinations) + Twilio's own per-verification
  attempt cap; the code is never logged, returned, or stored on the Twilio path.
- Every Twilio call is timeout-bounded; auto-retry is disabled (no double-bill /
  double-SMS); Twilio errors are mapped to clean 4xx/503, never leaked raw.

## 5. Manual verification checklist

- Send → receive SMS → verify correct code → session tokens returned.
- Wrong code → 401; expired code → 401.
- Resend within cooldown → 429 with `retryAfterSeconds`.
- Exceed daily cap → 429.
- Kill Redis → sends still work (fail-open); cooldown temporarily not enforced.
- Vendor OTP still works (local provider, now 6-digit).

## 6. Scale-out notes (later, not required now)

- The global `@Throttle` uses an in-memory store, correct for the current single
  PM2 instance. When running multiple instances, back it with Redis
  (`@nest-lab/throttler-storage-redis`) so counters are shared.
- Optional index for the local provider's hot lookup:
  `@@index([phone, purpose, consumedAt])` on `PhoneVerification` (needs a
  migration), plus a periodic cleanup of expired rows.

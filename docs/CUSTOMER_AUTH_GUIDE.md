# Customer Authentication — Login & Signup Guide

Passwordless phone-OTP auth for customers, powered by Twilio Verify. This guide
is written for the client/mobile/frontend integrator: exact endpoints, request
bodies, and response shapes as the API actually returns them.

## Key idea: one flow does both signup and login

There is **no separate "signup" vs "login"** for the OTP flow. The customer
enters their phone, receives a 6-digit code, and submits it:

- **First time that number is seen** → an account is created automatically
  (customer role granted, phone marked verified) and tokens are returned.
- **Returning number** → the existing user is logged in and tokens are returned.

An optional `register` endpoint exists only to capture a name + email profile
(see §5). It does **not** verify the phone.

## Conventions

- **Base URL:** all routes are under the global `/api` prefix, e.g.
  `https://<host>/api/auth/customer/otp/send`.
- **Success envelope** — every 2xx response is wrapped:

  ```json
  {
    "success": true,
    "data": { /* the endpoint's payload */ },
    "timestamp": "2026-07-24T10:00:00.000Z",
    "path": "/api/auth/customer/otp/verify"
  }
  ```

  Read the real payload from `response.data`.

- **Error envelope** — every 4xx/5xx is wrapped:

  ```json
  {
    "success": false,
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "Invalid or expired code",
    "timestamp": "2026-07-24T10:00:00.000Z",
    "path": "/api/auth/customer/otp/verify"
  }
  ```

- **Phone format:** send E.164 (`+971501234567`). Bare local numbers are
  normalized server-side to UAE (`+971`), but sending E.164 is safest.

---

## Step 1 — Request an OTP

**`POST /api/auth/customer/otp/send`**

Request:

```json
{ "phone": "+971501234567" }
```

Response (`200`), `data`:

```json
{
  "phone": "+971501234567",
  "sent": true,
  "expiresInSeconds": 600,
  "devCode": "123456"
}
```

- `expiresInSeconds` — how long the code is valid (drive your countdown from
  this). Twilio Verify codes last ~10 minutes.
- `devCode` — **only present outside production** (non-`production` NODE_ENV) so
  QA can test without real SMS. It is never returned in production.

curl:

```bash
curl -X POST https://<host>/api/auth/customer/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+971501234567"}'
```

### Rate limits on this endpoint

- **Per phone number** (Redis): a resend cooldown (default 30s) and a daily cap
  (default 5/day). Exceeding either returns `429`:

  ```json
  {
    "success": false,
    "statusCode": 429,
    "error": "HttpException",
    "message": "Please wait 18s before requesting another code.",
    "timestamp": "…",
    "path": "…"
  }
  ```

  The wait time is in the `message` text — use it to disable your "Resend"
  button.

- **Per IP** (throttler): max 3 sends/minute. Exceeding returns `429` with a
  generic "Too many requests" message.

---

## Step 2 — Verify the OTP (this logs in or signs up)

**`POST /api/auth/customer/otp/verify`**

Request:

```json
{ "phone": "+971501234567", "code": "123456" }
```

- `code` must be exactly **6 digits**.

Response (`200`), `data`:

```json
{
  "status": "authenticated",
  "tokens": {
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "eyJhbGciOi…",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "b3f1…",
      "email": "customer+971501234567@zook.local",
      "fullName": null,
      "roles": ["customer"],
      "adminLevel": null,
      "isVerified": null,
      "storeName": null
    }
  }
}
```

- Store `accessToken` (use for API calls) and `refreshToken` (use to renew).
- `expiresIn` is the access-token lifetime in **seconds** (default 900 = 15 min).
- On a brand-new number, `fullName` is `null` and `email` is a synthetic
  placeholder — collect the real profile via §5 if your product needs it.

curl:

```bash
curl -X POST https://<host>/api/auth/customer/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+971501234567","code":"123456"}'
```

Failure cases:

| Situation | Status | `message` |
|---|---|---|
| Wrong / expired / already-used code | `401` | `Invalid or expired code` |
| Code not 6 digits | `400` | `Code must be 6 digits` |
| Too many verify attempts (per IP, 6/min) | `429` | Too many requests |
| Twilio outage | `503` | Verification service is temporarily unavailable. Please try again. |

- Per-IP verify throttle: 6/min. Twilio Verify also caps attempts per code
  internally, after which the code is invalidated (returns `401`).

---

## Step 3 — Use the access token

Send the access token on every authenticated request:

```
Authorization: Bearer <accessToken>
```

Check the current session:

**`GET /api/auth/me`** (requires `Authorization` header) → `data` is the
authenticated user (id, email, roles, …).

---

## Step 4 — Refresh the session

When the access token expires (or ~1 min before), exchange the refresh token for
a new pair. **Refresh tokens rotate** — the old one is revoked, so always store
the newly returned pair.

**`POST /api/auth/refresh`**

Request:

```json
{ "refreshToken": "eyJhbGciOi…" }
```

Response (`200`), `data` — same `AuthTokensDto` shape as Step 2's `tokens`.

- Invalid / expired / revoked refresh token → `401`. On `401` here, send the
  user back to Step 1 (re-authenticate).

---

## Step 5 — (Optional) Capture profile with register

Use this only if you collect name + email at signup. It creates the account and
returns tokens immediately, but **does not verify the phone via OTP**. Decide
per your product whether to run this before or after the OTP step.

**`POST /api/auth/customer/register`**

Request:

```json
{
  "fullName": "Aisha Rahman",
  "email": "aisha@example.com",
  "countryCode": "+971",
  "phone": "501234567"
}
```

- `countryCode` (dial code, e.g. `+971`) and `phone` (national number, no dial
  code) are combined server-side into E.164.
- Rate limited to 5/min per IP.

Response (`201`), `data` — the `AuthTokensDto` shape (tokens + user).

Failure: email or phone already registered → `409` `An account with this email
or phone already exists`.

---

## Step 6 — Logout

**`POST /api/auth/logout`** (requires `Authorization` header)

Request:

```json
{ "refreshToken": "eyJhbGciOi…" }
```

Revokes that one refresh token (`204 No Content`). The access token remains
valid until it expires (short-lived by design), so also discard it client-side.

**`POST /api/auth/logout-all`** (requires `Authorization` header) — revokes every
refresh token for the user (logout from all devices).

---

## Recommended client flow

1. User enters phone → **Step 1** (`otp/send`). Start a countdown from
   `expiresInSeconds`; disable "Resend" for the cooldown.
2. User enters the 6-digit code → **Step 2** (`otp/verify`). Persist both tokens.
3. (Optional) If new user and you need a profile, show a name/email screen →
   **Step 5**, or a dedicated profile-update endpoint.
4. Attach `Authorization: Bearer <accessToken>` to all calls.
5. On `401` from a normal call → try **Step 4** (`refresh`); if that also
   `401`s, restart at Step 1.
6. On logout → **Step 6** and clear stored tokens.

## Quick endpoint reference

| Purpose | Method | Path | Auth |
|---|---|---|---|
| Send OTP | POST | `/api/auth/customer/otp/send` | none |
| Verify OTP (login/signup) | POST | `/api/auth/customer/otp/verify` | none |
| Register (profile) | POST | `/api/auth/customer/register` | none |
| Current user | GET | `/api/auth/me` | Bearer |
| Refresh tokens | POST | `/api/auth/refresh` | none (refresh token in body) |
| Logout | POST | `/api/auth/logout` | Bearer |
| Logout all devices | POST | `/api/auth/logout-all` | Bearer |

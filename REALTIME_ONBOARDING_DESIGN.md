# Real-time Onboarding Approval Notifications — Design (Supabase)

**Goal:** when an admin approves/rejects an onboarding step, the vendor's
frontend (web + mobile) learns about it in real time.

**Stack:** NestJS + Prisma (Postgres on **Supabase**) + JWT. The client already
signs in through Supabase and the project already uses `@supabase/supabase-js`.
Single PM2 process today (`instances: 1`, `fork`).

Onboarding is **two admin-gated steps**, both persisted:
1. **KYC documents** — `AdminKycService.approve()/reject()` → `VendorKyc.status`
2. **Store activation** — `AdminVendorsService.activate()` → `Vendor.status`

---

## Core principle: DB is the source of truth; real-time is only a signal

The client can be disconnected exactly when an admin approves (review is
asynchronous). So real-time is never the only delivery path:

1. **State (truth):** `VendorKyc.status` + `Vendor.status` in Postgres.
2. **Pull:** `GET /vendors/me/onboarding-status` (already exists) returns the
   4-step tracker. The client fetches it on load and on every (re)connect.
3. **Push (accelerator):** a live signal so the UI updates without polling.

A missed push never leaves the UI wrong — the next pull reconciles it.

---

## Why Supabase Realtime (and why no self-hosted sockets, no Redis)

The client is already connected to Supabase, so **Supabase Realtime is the
socket layer** — a managed WebSocket server with auth and horizontal fan-out.
We use **Broadcast** (not Postgres Changes): the backend sends a clean,
controlled message rather than streaming raw row diffs.

- **No NestJS Socket.IO gateway** — we'd be re-implementing Supabase Realtime.
- **No Redis** — Redis is only needed to fan out across multiple instances of a
  *self-hosted* socket server. Supabase is the shared realtime layer, so that
  problem doesn't exist here. (Keep Redis on the shelf unless we ever drop
  Supabase Realtime and build our own gateway.)

Mobile additionally uses **FCM** for background push, because Realtime — like
any socket — only reaches a connected, foregrounded app, and KYC approval often
lands while the app is closed.

---

## Architecture (as implemented)

```
approve()/reject()/activate()
        │  (after the DB write commits)
        ▼
  EventEmitter2.emit('onboarding.step_changed', {...})   ← decouples action from delivery
        │
        ▼
  OnboardingNotifier  @OnEvent('onboarding.step_changed')
        ├── SupabaseRealtimeService.broadcast()  → Supabase Realtime (HTTP API)
        │        topic: onboarding:<userId>, event: step_changed   → web + foreground mobile
        └── PushSender.send()  → FCM (scaffolded)                  → backgrounded mobile
        +
  GET /vendors/me/onboarding-status  ← source of truth; client refetches on connect/resume
```

Identity: this backend issues its **own** JWTs, so the app `User.id` ≠ the
Supabase auth id. We therefore mint a Supabase-Realtime token whose `sub` is the
app `User.id` (`GET /realtime/token`), so `auth.uid()` in the RLS policy matches
the `onboarding:<userId>` topic the backend broadcasts to. App `User.id` stays
authoritative everywhere.

---

## Backend pieces added in this repo

| File | Role |
|---|---|
| `src/realtime/onboarding-events.ts` | Event name + `OnboardingStepChangedEvent` payload type |
| `src/realtime/supabase-realtime.service.ts` | Sends Broadcast via Supabase HTTP API (service-role key) |
| `src/realtime/onboarding-notifier.service.ts` | `@OnEvent` listener; fans out to Realtime + FCM |
| `src/realtime/realtime-token.{service,controller}.ts` | `GET /realtime/token` — mints the Realtime auth token |
| `src/realtime/push/push-sender.ts` | Transport-agnostic `PushSender` interface |
| `src/realtime/push/fcm-push-sender.ts` | FCM impl — **scaffolded** (logs; TODO firebase-admin) |
| `src/realtime/device-tokens.{service,controller}.ts` | `POST/DELETE /me/device-tokens` registration |
| `src/realtime/dto/register-device-token.dto.ts` | Validation for token registration |
| `src/realtime/realtime.module.ts` | Wires the module |
| `prisma` `DeviceToken` model + migration | Stores FCM tokens per user/device |
| `AdminKycService` / `AdminVendorsService` | Emit `onboarding.step_changed` after commit |
| `AppModule` | `EventEmitterModule.forRoot()` + `RealtimeModule` |

No new env vars are required for Realtime — it reuses `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET`. FCM needs Firebase
credentials later (see the scaffold's TODO).

---

## Broadcast contract (what the frontend binds to)

- **Channel/topic:** `onboarding:<userId>` (private)
- **Event:** `step_changed`
- **Payload:**
  ```json
  {
    "step": "kyc" | "store_activation",
    "status": "approved" | "rejected",
    "reason": "string | null",
    "kycId": "string | null",
    "occurredAt": "ISO-8601"
  }
  ```

---

## Operational notes

- **Emit after commit**, never inside the transaction (no notifying on
  rolled-back state). The notifier also runs decoupled from the request, so a
  slow/failed notification never affects the admin's HTTP response.
- **Scaling:** in-memory `EventEmitter2` is correct on a single instance; it
  stays correct multi-instance too, because the realtime *fan-out* is Supabase's
  (each instance just POSTs a broadcast). No Redis needed.
- **Run on deploy:** `npx prisma generate` + `npx prisma migrate deploy` (the
  workflow already does both) to create the `device_tokens` table.

See `docs/realtime/realtime-how-it-works.md` for the end-to-end walkthrough and
the Supabase RLS setup, and `docs/realtime/frontend-guide.md` for React/Next.js
and Flutter integration.

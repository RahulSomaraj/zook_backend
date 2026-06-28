# How onboarding real-time actually works (end to end)

This explains, step by step, what happens from the moment an admin clicks
"Approve" to the moment the vendor's screen updates — and why each piece exists.
Read this once and the frontend guide will make complete sense.

---

## The one idea to hold onto

**The database is the truth. Real-time is just a fast nudge.**

When an admin approves KYC, the only thing that *must* happen is the row in
Postgres flips to `approved`. Everything else — the live update, the push
notification — is an optimization so the vendor doesn't have to refresh. If a
live message is ever missed (app was closed, network blipped), the vendor's app
still becomes correct the next time it asks the server "what's my status?".

So there are always **two channels** to the frontend:

1. **Pull (authoritative):** `GET /vendors/me/onboarding-status` → the 4-step
   tracker. The app calls this on launch and whenever it reconnects/resumes.
2. **Push (accelerator):** a live message that says "something changed, update
   now (or re-pull)".

If you remember only this, you'll never design a broken real-time flow.

---

## The journey of one approval

```
Admin app                Backend (NestJS)                 Supabase            Vendor app
   │  POST /admin/vendor-kyc/:id/approve                      │                    │
   ├───────────────────────────►│                            │                    │
   │                            │ 1. UPDATE vendor_kyc        │                    │
   │                            │    SET status='approved'    │                    │
   │                            │    (Postgres on Supabase)   │                    │
   │                            │                             │                    │
   │                            │ 2. emit('onboarding.step_changed')               │
   │                            │    (in-process event)       │                    │
   │   ◄────────────────────────┤ 3. HTTP 200 to admin        │                    │
   │   (admin request is done — notification runs separately) │                    │
   │                            │                             │                    │
   │                            │ 4. OnboardingNotifier:      │                    │
   │                            │    a) POST Realtime broadcast│───► onboarding:<id>│
   │                            │       topic onboarding:<id> │     event           │
   │                            │                             │     step_changed ──►│ 5a. live update
   │                            │    b) FCM push to devices   │                    │     (if connected)
   │                            │       (scaffolded)          │ ─ ─ ─ FCM ─ ─ ─ ─ ►│ 5b. background push
   │                            │                             │                    │
   │                            │                  6. app re-pulls /onboarding-status (truth)
```

Steps 1–3 are the request the admin made. Steps 4–5 happen **after** and are
decoupled, so a slow or failing notification can never make the admin's button
hang or error.

---

## Each backend piece, in plain terms

**1. The approval services** (`AdminKycService`, `AdminVendorsService`)
They do the real work: update the row. Then — *after* the write commits — they
emit an in-process event `onboarding.step_changed`. They do **not** know or care
how the vendor gets notified. That separation is deliberate: tomorrow we can add
email or SMS by adding a listener, touching none of this code.

> Why "after commit"? If we emitted inside the DB transaction and the
> transaction later rolled back, we'd have told the vendor "approved!" for a
> change that never happened. Emit only once it's durably saved.

**2. `EventEmitter2`** (`@nestjs/event-emitter`, registered in `AppModule`)
A tiny in-memory pub/sub. `emit(...)` drops the event on a bus; whoever
subscribed picks it up. No network, no broker, no Redis — it's just function
calls inside the same Node process.

**3. `OnboardingNotifier`** (`@OnEvent('onboarding.step_changed')`)
The subscriber. For each event it does two things:
- **Broadcast** to Supabase Realtime on topic `onboarding:<userId>`.
- **Push** via FCM to that user's registered devices (currently scaffolded —
  it logs what it *would* send).

**4. `SupabaseRealtimeService`**
Sends the broadcast over Supabase's **stateless HTTP API**
(`POST /realtime/v1/api/broadcast`) using the service-role key. "Stateless"
means the backend doesn't hold a websocket open — it just POSTs a message and
Supabase delivers it to every subscribed client. This is also why we need no
Redis: Supabase is the shared fan-out layer, even if we run many backend
instances.

**5. `GET /realtime/token`** (`RealtimeTokenController`)
The subtle but important bit. Our backend issues its **own** JWTs, so our
`User.id` is different from the Supabase auth id. For the vendor's app to be
allowed onto the private `onboarding:<userId>` channel, it presents a token whose
identity equals that `userId`. This endpoint mints exactly that: a short-lived
JWT signed with the Supabase JWT secret, with `sub = <our User.id>`. The app
calls `supabase.realtime.setAuth(token)` with it before subscribing.

**6. `device_tokens` + `DeviceTokensService`**
A table of FCM registration tokens (one per install). The mobile app registers
its token via `POST /me/device-tokens` after login. The notifier looks these up
to know where to send background push.

---

## Supabase setup you must do once (RLS for the private channel)

A **private** Broadcast channel is gated by Row-Level Security on
`realtime.messages`. Run this in the Supabase SQL editor so a user can only
receive on their *own* topic:

```sql
-- Allow an authenticated client to receive broadcasts ONLY on its own
-- onboarding:<uid> topic. auth.uid() comes from the token's `sub` claim —
-- which, thanks to GET /realtime/token, equals our app User.id.
create policy "receive own onboarding broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'onboarding:' || auth.uid()::text
);
```

Notes:
- The backend **sends** with the service-role key, which bypasses RLS — this
  policy only governs what clients are allowed to **receive**.
- If your Supabase project signs tokens asymmetrically (RS256/ES256) and exposes
  no shared `SUPABASE_JWT_SECRET`, `GET /realtime/token` can't mint an HS256
  token. In that case either (a) enable the project JWT secret, or (b) have the
  client authorize Realtime with its existing Supabase session and key the
  channel by the Supabase auth id instead — and broadcast to that id (you'd then
  persist the Supabase uid per user at sign-in). The HS256 path above is the
  simplest and is recommended.

---

## Failure behavior (by design)

- **Vendor offline during approval:** no live message and/or push is queued by
  FCM; on next app open the app re-pulls `/onboarding-status` and shows the new
  state. Correct.
- **Realtime broadcast fails:** logged, swallowed. The admin response already
  succeeded; the vendor reconciles on next pull. Correct.
- **Duplicate/stale messages:** the payload carries `occurredAt`; the client can
  ignore an event older than what it has, or simply re-pull (idempotent).

---

## What's real vs. scaffolded

- **Real and working now:** event emit → Supabase Realtime broadcast → client;
  the `/realtime/token` endpoint; device-token registration; the
  `/onboarding-status` source of truth.
- **Scaffolded (no creds needed yet):** `FcmPushSender` logs the push instead of
  sending it. To finish, follow the TODO in `src/realtime/push/fcm-push-sender.ts`
  (`npm i firebase-admin`, add a service account, send a multicast).

# Flutter implementation prompts — paste into your Flutter AI assistant

Hand these to whatever assistant is working **inside the Flutter repo**, in
order. Each prompt is self-contained. Fill in the two bracketed values once:

- `[API_BASE_URL]` — your NestJS backend base URL
- `[STATE_MGMT]` — your state layer (Provider / Riverpod / Bloc / setState)

The backend is already built and must not change. The full reference + the
robust service code these prompts produce lives in
`flutter-realtime-implementation.md`.

---

## Shared context (prepend to any prompt below)

```
We have a NestJS backend (already built — do NOT modify it). Our Flutter vendor
app must show onboarding-approval updates in real time using Supabase Realtime
(live, foreground) + FCM (background). Backend contract:

- GET  /vendors/me/onboarding-status   → SOURCE OF TRUTH (the step tracker JSON).
                                          Auth: Bearer <app access token>.
- GET  /realtime/token                 → { token, expiresIn }. Call setAuth(token)
                                          BEFORE subscribing. token.sub == our app User.id.
- POST /me/device-tokens   { token, platform: "ios"|"android" }   (register FCM)
- DELETE /me/device-tokens { token }                              (logout)
- Live channel: Supabase Realtime Broadcast, PRIVATE topic "onboarding:<userId>",
  event "step_changed". <userId> is our app User.id (same as token.sub).
- FCM data payload: { type:"onboarding", step, status, kycId }.

GOLDEN RULE: the REST status endpoint is the truth. A realtime/push message is
ONLY a nudge meaning "re-pull the truth now." Never render state from a message
payload alone. Re-pull on: launch, every message, reconnect, and app resume.

Client uses the Supabase ANON key only (never the service-role key).
API base: [API_BASE_URL]. State management: [STATE_MGMT].
```

---

## Prompt 1 — packages + init

```
[paste Shared context]

Task: Set up dependencies and initialization.
1. Add to pubspec.yaml: supabase_flutter ^2.5.0, firebase_core ^3.0.0,
   firebase_messaging ^15.0.0, http ^1.2.0.
2. In main.dart: ensureInitialized, Firebase.initializeApp(), register a
   top-level @pragma('vm:entry-point') FirebaseMessaging.onBackgroundMessage
   handler (no-op body is fine), then Supabase.initialize(url, anonKey) reading
   both from String.fromEnvironment, with RealtimeClientOptions(eventsPerSecond: 5).
Show me the full pubspec dependency block and the full main.dart.
```

---

## Prompt 2 — the robust realtime service (the important one)

```
[paste Shared context]

Task: Create lib/services/onboarding_realtime_service.dart — a single class
OnboardingRealtimeService that owns the entire realtime lifecycle and is
RESILIENT to the common Supabase Realtime failure modes. Requirements:

Constructor params: apiBase, userId (our app User.id), getAppJwt (a function
returning the CURRENT app JWT — it may rotate, so call it fresh each request),
onStatus (callback receiving the parsed status JSON).

Public methods:
- start(): idempotent. Mint realtime token → supabase.realtime.setAuth(token) →
  refetchStatus() (truth FIRST) → subscribe to the private channel → register FCM.
- onResume(): re-authorize realtime + refetchStatus() (socket may have died while
  backgrounded). Cheap, safe to call repeatedly.
- refetchStatus(): GET /vendors/me/onboarding-status, call onStatus on 200, never
  throw on network error.
- dispose(): cancel timers, DELETE the FCM device token, removeChannel, setAuth(null).

Resilience requirements (do NOT skip these):
1. TOKEN EXPIRY: /realtime/token returns expiresIn. Schedule a Timer to re-mint
   and re-setAuth at ~80% of expiresIn, otherwise the channel goes silently dead.
   On mint failure, retry in 30s.
2. SUBSCRIBE STATUS: use channel.subscribe((status, error){...}). On `subscribed`,
   call refetchStatus() (reconcile anything missed while down). On `channelError`
   or `timedOut`, wait ~3s, re-authorize, and resubscribe.
3. NO DUPLICATE CHANNELS: before creating a channel, removeChannel any existing one.
4. FCM: requestPermission, getToken, POST to /me/device-tokens (platform from
   Platform.isIOS), and re-POST on onTokenRefresh. dispose() DELETEs it.
The broadcast callback for event "step_changed" must just call refetchStatus().
Show the complete file.
```

---

## Prompt 3 — wire to lifecycle + login/logout

```
[paste Shared context]

Task: Integrate OnboardingRealtimeService into the onboarding screen.
1. Make the screen's State use WidgetsBindingObserver. In initState, construct
   the service (getAppJwt reads the latest token from [STATE_MGMT]; onStatus
   pushes JSON into [STATE_MGMT]) and call start().
2. Register FCM foreground/tap handlers: FirebaseMessaging.onMessage,
   onMessageOpenedApp, and getInitialMessage — for data.type == 'onboarding',
   call service.refetchStatus() (and navigate to onboarding on tap).
3. In didChangeAppLifecycleState, on AppLifecycleState.resumed call
   service.onResume().
4. On logout, call service.dispose().
5. Render the tracker purely from the status JSON in [STATE_MGMT]; show
   rejectionReason on a rejected step.
Show the screen State class and the logout hook.
```

---

## Prompt 4 — platform config (native)

```
[paste Shared context]

Task: Wire native Firebase/FCM config (no Dart logic).
- Place google-services.json at android/app/, GoogleService-Info.plist at ios/Runner/.
- android/build.gradle: classpath 'com.google.gms:google-services:4.4.x'.
- android/app/build.gradle: apply plugin 'com.google.gms.google-services'.
- iOS: enable Push Notifications capability; confirm APNs auth key is uploaded
  to Firebase (Project Settings → Cloud Messaging → Apple app).
List exactly which files to edit and the lines to add, and how to verify FCM
delivery on a physical iOS device.
```

---

## Acceptance criteria (give these to the assistant too)

```
- Approving/rejecting KYC or activating the store updates the tracker with NO
  manual refresh while the app is open.
- Airplane mode for 30s then back → tracker still correct (resume re-pull).
- App open 60+ minutes → an approval still updates it (realtime token refreshed).
- channelError/timedOut from subscribe triggers re-auth + resubscribe, not a dead UI.
- App closed → device is registered for push; tapping the notification opens
  onboarding showing fresh state.
- Service-role key never appears in client code; status is always rendered from
  the REST endpoint, never from a message payload alone.
```

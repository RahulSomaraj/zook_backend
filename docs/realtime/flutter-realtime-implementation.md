# Flutter — Supabase Realtime implementation (robust)

This is the **build order + drop-in code** for the Flutter app to consume the
onboarding realtime channel reliably. The earlier snippets in
`flutter-fcm-todo.md` show the happy path; this doc adds the parts that make
realtime actually survive in production: **token expiry, socket drops, app
resume, and subscription errors**.

> Golden rule (unchanged): `GET /vendors/me/onboarding-status` is the **truth**.
> Every realtime/push message is only a nudge meaning *"re-pull the truth now."*
> Render the tracker from the REST response — never solely from a message.

---

## The realtime issues this handles (why the naive version breaks)

| Issue | What goes wrong with the naive snippet | Fix here |
|---|---|---|
| **Realtime token expires** (1h TTL) | After 60 min the channel silently stops delivering. No error, UI just goes stale. | Refresh the token on a timer (at ~50 min) and re-`setAuth`. |
| **Socket drops** (wifi↔cellular, tunnel, backgrounding) | Messages sent while disconnected are missed forever. | Re-pull truth on every reconnect + on app resume. |
| **Subscribe fails** (RLS/token wrong) | `subscribe()` is fire-and-forget; you never learn it failed. | Watch the subscribe status callback; surface/retry on `CHANNEL_ERROR` / `TIMED_OUT`. |
| **Duplicate channels** (re-login, hot reload) | Two channels for the same user → double refetches, leaks. | Tear down the old channel before creating a new one. |
| **App was closed during approval** | No socket existed when the admin approved. | FCM nudge + a guaranteed re-pull on launch/resume. |

---

## Build order

1. **Packages** → `pubspec.yaml` (step 1).
2. **Platform files** → Firebase configs, gradle, APNs (see `flutter-fcm-todo.md` §4b — unchanged).
3. **`main.dart`** init → `Firebase.initializeApp()` + `Supabase.initialize()` + the FCM background handler (step 2).
4. **`OnboardingRealtimeService`** → the robust service in step 3. This is the core.
5. **Wire to lifecycle + login/logout** → step 4.
6. **Smoke test** → §6 of `flutter-fcm-todo.md`.

---

## 1 · Packages

```yaml
# pubspec.yaml
dependencies:
  supabase_flutter: ^2.5.0
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  http: ^1.2.0
```

---

## 2 · `main.dart`

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Must be a top-level function (background isolate can't see app state).
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Nothing to do here for onboarding — the data-only payload just wakes the OS
  // to show the notification. Truth is re-pulled when the user opens the app.
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'), // anon key ONLY
    realtimeClientOptions: const RealtimeClientOptions(
      eventsPerSecond: 5,
    ),
  );

  runApp(const MyApp());
}
```

---

## 3 · `OnboardingRealtimeService` (the robust core)

Drop this in `lib/services/onboarding_realtime_service.dart`. It owns the whole
lifecycle: token mint → setAuth → fetch truth → subscribe → keep alive →
reconcile on resume → clean teardown. You give it an `onStatus` callback that
hands fresh status JSON to your state layer (Provider / Riverpod / Bloc — your
choice).

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

typedef TokenProvider = String Function();      // returns the current app JWT
typedef StatusCallback = void Function(Map<String, dynamic> status);

class OnboardingRealtimeService {
  OnboardingRealtimeService({
    required this.apiBase,
    required this.userId,
    required this.getAppJwt,
    required this.onStatus,
  });

  final String apiBase;
  final String userId;
  final TokenProvider getAppJwt;     // always read the *latest* token (it may rotate)
  final StatusCallback onStatus;

  final SupabaseClient _supabase = Supabase.instance.client;
  RealtimeChannel? _channel;
  Timer? _tokenRefreshTimer;
  bool _started = false;

  // ---- public API -----------------------------------------------------------

  /// Call once after login. Idempotent.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    await _authorizeRealtime();   // mint token + setAuth
    await refetchStatus();        // truth first, before any message can arrive
    _subscribe();                 // open the live channel
    await _registerPush();        // FCM token for background
  }

  /// Call on app resume (and after any reconnect). Cheap and safe to spam.
  Future<void> onResume() async {
    if (!_started) return;
    // The socket may have died while backgrounded; re-pull truth unconditionally,
    // and make sure realtime auth is still valid.
    await _authorizeRealtime();
    await refetchStatus();
  }

  /// The ONLY source of truth. Safe to call as often as you like.
  Future<void> refetchStatus() async {
    try {
      final res = await http.get(
        Uri.parse('$apiBase/vendors/me/onboarding-status'),
        headers: {'Authorization': 'Bearer ${getAppJwt()}'},
      );
      if (res.statusCode == 200) {
        onStatus(jsonDecode(res.body) as Map<String, dynamic>);
      }
    } catch (_) {
      // Network blip — the next resume/nudge will reconcile. Do not crash the UI.
    }
  }

  /// Call on logout. Removes push + tears down the channel.
  Future<void> dispose() async {
    _tokenRefreshTimer?.cancel();
    await _unregisterPush();
    if (_channel != null) {
      await _supabase.removeChannel(_channel!);
      _channel = null;
    }
    _supabase.realtime.setAuth(null);
    _started = false;
  }

  // ---- realtime auth (token mint + scheduled refresh) -----------------------

  Future<void> _authorizeRealtime() async {
    try {
      final res = await http.get(
        Uri.parse('$apiBase/realtime/token'),
        headers: {'Authorization': 'Bearer ${getAppJwt()}'},
      );
      if (res.statusCode != 200) return;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final token = body['token'] as String;
      final expiresIn = (body['expiresIn'] as num?)?.toInt() ?? 3600;

      _supabase.realtime.setAuth(token);

      // Re-mint BEFORE it expires, otherwise the channel goes silently dead.
      _tokenRefreshTimer?.cancel();
      final refreshIn = Duration(seconds: (expiresIn * 0.8).floor());
      _tokenRefreshTimer = Timer(refreshIn, _authorizeRealtime);
    } catch (_) {
      // Retry shortly; without a valid token the private channel won't deliver.
      _tokenRefreshTimer?.cancel();
      _tokenRefreshTimer = Timer(const Duration(seconds: 30), _authorizeRealtime);
    }
  }

  // ---- subscription (with status handling + reconnect reconcile) ------------

  void _subscribe() {
    // Always drop an existing channel first (re-login / hot reload safety).
    if (_channel != null) {
      _supabase.removeChannel(_channel!);
      _channel = null;
    }

    final channel = _supabase.channel(
      'onboarding:$userId',
      opts: const RealtimeChannelConfig(private: true),
    );

    channel.onBroadcast(
      event: 'step_changed',
      callback: (_) => refetchStatus(), // any message = re-pull truth
    );

    channel.subscribe((status, error) {
      switch (status) {
        case RealtimeSubscribeStatus.subscribed:
          // (Re)subscribed — we may have missed messages while down. Reconcile.
          refetchStatus();
          break;
        case RealtimeSubscribeStatus.channelError:
        case RealtimeSubscribeStatus.timedOut:
          // Token/RLS problem or transient drop. Re-auth then resubscribe.
          Future.delayed(const Duration(seconds: 3), () async {
            await _authorizeRealtime();
            _subscribe();
          });
          break;
        case RealtimeSubscribeStatus.closed:
          break;
      }
    });

    _channel = channel;
  }

  // ---- FCM device token -----------------------------------------------------

  String? _fcmToken;
  StreamSubscription<String>? _tokenRefreshSub;

  Future<void> _registerPush() async {
    await FirebaseMessaging.instance.requestPermission();
    _fcmToken = await FirebaseMessaging.instance.getToken();
    if (_fcmToken != null) await _postDeviceToken(_fcmToken!);

    _tokenRefreshSub?.cancel();
    _tokenRefreshSub =
        FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      _fcmToken = t;
      _postDeviceToken(t);
    });
  }

  Future<void> _postDeviceToken(String token) async {
    try {
      await http.post(
        Uri.parse('$apiBase/me/device-tokens'),
        headers: {
          'Authorization': 'Bearer ${getAppJwt()}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'token': token,
          'platform': Platform.isIOS ? 'ios' : 'android',
        }),
      );
    } catch (_) {/* best-effort */}
  }

  Future<void> _unregisterPush() async {
    await _tokenRefreshSub?.cancel();
    if (_fcmToken == null) return;
    try {
      await http.delete(
        Uri.parse('$apiBase/me/device-tokens'),
        headers: {
          'Authorization': 'Bearer ${getAppJwt()}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'token': _fcmToken}),
      );
    } catch (_) {/* best-effort */}
  }
}
```

---

## 4 · Wire it to app lifecycle + login/logout

Realtime survives backgrounding badly; the cheap, reliable fix is to **re-pull
truth whenever the app comes back to the foreground.** Use a
`WidgetsBindingObserver`.

```dart
class _OnboardingScreenState extends State<OnboardingScreen>
    with WidgetsBindingObserver {
  late final OnboardingRealtimeService _service;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _service = OnboardingRealtimeService(
      apiBase: const String.fromEnvironment('API_BASE_URL'),
      userId: context.read<Auth>().userId,     // your app User.id
      getAppJwt: () => context.read<Auth>().accessToken, // read latest each call
      onStatus: (json) => context.read<OnboardingStore>().update(json),
    );
    _service.start();

    // Foreground FCM → refresh the tracker.
    FirebaseMessaging.onMessage.listen((m) {
      if (m.data['type'] == 'onboarding') _service.refetchStatus();
    });
    // Tap from background → ensure we're showing fresh state.
    FirebaseMessaging.onMessageOpenedApp.listen((m) {
      if (m.data['type'] == 'onboarding') _service.refetchStatus();
    });
    // Launched from terminated via a notification tap.
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m?.data['type'] == 'onboarding') _service.refetchStatus();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _service.onResume();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
```

On **logout** call `_service.dispose()` (removes the FCM token server-side,
tears down the channel, clears realtime auth).

---

## 5 · Things that bite people (checklist)

- [ ] **Anon key only** in the client. The service-role key must never ship in the app.
- [ ] `setAuth(token)` is called **before** `subscribe()` — the service does this; keep that order if you refactor.
- [ ] The RLS policy on `realtime.messages` is applied in Supabase (private channel won't deliver without it). See `flutter-fcm-todo.md` §1.
- [ ] `userId` is your **app `User.id`** (from the login response), the same id the realtime token carries as `sub`. Not the Supabase auth id.
- [ ] iOS: APNs key uploaded to Firebase, Push Notifications capability enabled — otherwise FCM silently no-ops on iOS.
- [ ] Background handler is a **top-level** `@pragma('vm:entry-point')` function.
- [ ] You never render onboarding state from the broadcast payload alone — always from `refetchStatus()`.

---

## 6 · Verify (matches backend smoke test)

1. Login → `device_tokens` row appears in Supabase Table Editor.
2. App foreground → admin approves KYC → tracker updates in < 1s (Realtime).
3. Turn on airplane mode for 30s, turn off → tracker still correct (resume re-pull).
4. Leave app open 60+ min → approve again → still updates (token refresh works).
5. Background the app → admin activates store → system notification (FCM).
6. Tap it → app opens on onboarding showing "Store approved".
7. Logout → `device_tokens` row deleted.
```

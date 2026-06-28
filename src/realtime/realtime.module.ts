import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeviceTokensController } from './device-tokens.controller';
import { DeviceTokensService } from './device-tokens.service';
import { OnboardingNotifier } from './onboarding-notifier.service';
import { FcmPushSender } from './push/fcm-push-sender';
import { PushSender } from './push/push-sender';
import { RealtimeTokenController } from './realtime-token.controller';
import { RealtimeTokenService } from './realtime-token.service';
import { SupabaseRealtimeService } from './supabase-realtime.service';

/**
 * Real-time + push delivery for onboarding approvals.
 *
 * OnboardingNotifier subscribes to the `onboarding.step_changed` domain event
 * (emitted by the admin services via EventEmitter2) and fans it out to Supabase
 * Realtime and FCM. The JWT auth strategy is registered globally by AuthModule
 * (loaded in AppModule), so DeviceTokensController's JwtAuthGuard works without
 * importing AuthModule here — matching AdminModule's pattern.
 */
@Module({
  // JwtModule provides JwtService for minting Supabase Realtime tokens (signed
  // per-call with the Supabase JWT secret, so no static config needed here).
  imports: [JwtModule.register({})],
  controllers: [DeviceTokensController, RealtimeTokenController],
  providers: [
    SupabaseRealtimeService,
    RealtimeTokenService,
    DeviceTokensService,
    OnboardingNotifier,
    // Bind the abstract PushSender token to the FCM implementation.
    { provide: PushSender, useClass: FcmPushSender },
  ],
})
export class RealtimeModule {}

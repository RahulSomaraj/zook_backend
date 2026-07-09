import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeviceTokensService } from './device-tokens.service';
import { ONBOARDING_STEP_CHANGED } from './onboarding-events';
import type { OnboardingStepChangedEvent } from './onboarding-events';
import { PushSender } from './push/push-sender';
import { SupabaseRealtimeService } from './supabase-realtime.service';

/**
 * Fans an onboarding step change out to the two delivery channels:
 *   • Supabase Realtime Broadcast → web + foreground mobile (live, in-app)
 *   • FCM push                    → mobile when backgrounded/closed
 *
 * Both are best-effort. The client always reconciles against
 * GET /vendors/me/onboarding-status, which remains the source of truth, so a
 * missed message never leaves the UI in a wrong state.
 *
 * The handler runs async/decoupled from the request that emitted the event, so
 * a slow or failing notification never affects the admin's HTTP response.
 */
@Injectable()
export class OnboardingNotifier {
  private readonly logger = new Logger(OnboardingNotifier.name);

  constructor(
    private readonly realtime: SupabaseRealtimeService,
    private readonly push: PushSender,
    private readonly deviceTokens: DeviceTokensService,
  ) {}

  @OnEvent(ONBOARDING_STEP_CHANGED, { async: true })
  async handle(event: OnboardingStepChangedEvent): Promise<void> {
    const payload = {
      step: event.step,
      status: event.status,
      message: event.message,
      reason: event.reason,
      kycId: event.kycId,
      occurredAt: event.occurredAt,
    };

    // 1) Live in-app channel (web + foreground mobile).
    await this.realtime.broadcast({
      topic: `onboarding:${event.userId}`,
      event: 'step_changed',
      payload,
    });

    // 2) Background push (mobile). Best-effort; isolated from the broadcast.
    try {
      const tokens = await this.deviceTokens.tokensFor(event.userId);
      await this.push.send(tokens, {
        title: this.title(event),
        body: event.message,
        data: {
          type: 'onboarding',
          step: event.step,
          status: event.status,
          message: event.message,
          ...(event.kycId ? { kycId: event.kycId } : {}),
        },
      });
    } catch (err) {
      this.logger.error(`Push fan-out failed: ${(err as Error).message}`);
    }
  }

  private title(e: OnboardingStepChangedEvent): string {
    if (e.step === 'kyc') {
      return e.status === 'approved'
        ? 'Documents approved'
        : 'Documents need attention';
    }
    return e.status === 'approved' ? 'Store approved' : 'Store update';
  }
}

/**
 * Domain event emitted when an admin changes a vendor onboarding step
 * (KYC documents, or store activation). It is fired AFTER the DB write commits
 * — never inside the transaction — so we never notify about a state that could
 * roll back.
 *
 * The emitter (AdminKycService / AdminVendorsService) stays ignorant of how the
 * notification is delivered. OnboardingNotifier listens and fans this out to
 * Supabase Realtime (live, in-app) and FCM (background mobile push).
 */
export const ONBOARDING_STEP_CHANGED = 'onboarding.step_changed';

export type OnboardingStep = 'kyc' | 'store_activation';
export type OnboardingStepStatus = 'approved' | 'rejected';

export interface OnboardingStepChangedEvent {
  /** Target vendor's User.id — used for the realtime channel and push lookup. */
  userId: string;
  vendorId: string;
  step: OnboardingStep;
  status: OnboardingStepStatus;
  /** Rejection reason when status === 'rejected'; otherwise null. */
  reason: string | null;
  /** The KYC submission id when step === 'kyc'; otherwise null. */
  kycId: string | null;
  /** ISO-8601 timestamp of when the change occurred. */
  occurredAt: string;
}

export interface IssuedOtp {
  /** Seconds until the code expires — surfaced to the client for its countdown. */
  expiresInSeconds: number;
  /**
   * The code itself, returned ONLY by self-managed providers outside
   * production so the flow is testable without real SMS. Never populated by
   * Twilio Verify (Twilio never discloses the code) and never in production.
   */
  devCode?: string;
}

/**
 * A pluggable one-time-code backend. Implementations own delivery and, for
 * Twilio Verify, code generation/expiry/attempt limits too. Callers interact
 * only through this contract, so the provider can be swapped per audience via
 * config without touching auth services.
 */
export interface OtpProvider {
  /** Human-readable id for logging/metrics, e.g. 'local' | 'twilio_verify'. */
  readonly name: string;

  /** Generate/dispatch a code to `phone` for `purpose`. */
  issue(phone: string, purpose: string): Promise<IssuedOtp>;

  /** Return true iff `code` is the valid, unexpired code for `phone`/`purpose`. */
  verify(phone: string, code: string, purpose: string): Promise<boolean>;
}

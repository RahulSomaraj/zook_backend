declare module 'twilio' {
  export class Twilio {
    constructor(sid?: string, token?: string, opts?: Record<string, unknown>);
    verify: {
      v2: {
        services(sid: string): {
          verifications: { create(o: { to: string; channel: string }): Promise<{ status: string; sid: string }> };
          verificationChecks: { create(o: { to: string; code: string }): Promise<{ status: string }> };
        };
      };
    };
  }
}

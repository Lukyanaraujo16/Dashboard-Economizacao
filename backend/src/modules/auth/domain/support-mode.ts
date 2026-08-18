export type InactiveSupportState = {
  readonly active: false;
};

export type ActiveSupportState = {
  readonly active: true;
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly startedAt: string;
  readonly supportSessionId: string;
};

export type SupportState = InactiveSupportState | ActiveSupportState;

export type SessionSupportContext =
  | { readonly active: false }
  | {
      readonly active: true;
      readonly tenantId: string;
      readonly startedAt: string;
      readonly supportSessionId: string;
    };

export const INACTIVE_SUPPORT_STATE: InactiveSupportState = Object.freeze({ active: false });

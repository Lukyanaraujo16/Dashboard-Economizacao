export type ProactiveTitleKind = 'RECEIVABLE' | 'PAYABLE';

export type ProactiveTriggerParameterField = {
  readonly name: string;
  readonly valueKind: 'integer' | 'decimal' | 'titleKind' | 'none';
  readonly required: boolean;
};

export type CertifiedProactiveTriggerType = {
  readonly type: string;
  readonly description: string;
  readonly parameters: readonly ProactiveTriggerParameterField[];
};

export type ProactiveTriggerSuggestedDefaults = {
  readonly revenueGoalPercentages: readonly number[];
  readonly expenseCeilingPercentages: readonly number[];
  readonly expenseCeilingExceeded: boolean;
  readonly titleDueSoon: {
    readonly daysAhead: number;
    readonly minimumAmount: string;
    readonly titleKind: ProactiveTitleKind;
  };
};

export type ProactiveTriggerCatalog = {
  readonly types: readonly CertifiedProactiveTriggerType[];
  readonly suggestedDefaults: ProactiveTriggerSuggestedDefaults;
};

export type ProactiveTriggerConfiguration = {
  readonly id: string;
  readonly triggerType: string;
  readonly percentage: number | null;
  readonly daysAhead: number | null;
  readonly minimumAmount: string | null;
  readonly titleKind: ProactiveTitleKind | null;
  readonly active: boolean;
};

export type ProactiveTriggerRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unavailable';

export class ProactiveTriggerRequestError extends Error {
  readonly kind: ProactiveTriggerRequestFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: ProactiveTriggerRequestFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
    },
  ) {
    super(message);
    this.name = 'ProactiveTriggerRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

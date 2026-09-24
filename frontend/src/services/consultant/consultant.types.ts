export type ConsultantStatus = 'ACTIVE' | 'DISABLED' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

export type ConsultantUserStatus = {
  readonly status: ConsultantStatus;
};

export type ConsultantConversationStatus = 'OPEN' | 'CLOSED';

export type ConsultantConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly status: ConsultantConversationStatus;
  readonly startedAt: string;
  readonly lastMessageAt: string;
};

export type ConsultantSenderType = 'USER' | 'CONSULTANT' | 'SYSTEM';

export type ConsultantMessage = {
  readonly id: string;
  readonly senderType: ConsultantSenderType;
  readonly content: string;
  readonly createdAt: string;
};

export type ConsultantConversationDetail = ConsultantConversation & {
  readonly messages: readonly ConsultantMessage[];
};

export type SendConsultantMessageInput = {
  readonly content: string;
  readonly month?: string;
};

export type SendConsultantMessageResult = {
  readonly userMessage: ConsultantMessage;
  readonly consultantMessage: ConsultantMessage;
  readonly conversation?: ConsultantConversationDetail;
};

export type ConsultantErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type ConsultantRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'rate_limited'
  | 'unavailable';

export class ConsultantRequestError extends Error {
  readonly kind: ConsultantRequestFailureKind;
  readonly details?: ReadonlyArray<ConsultantErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: ConsultantRequestFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<ConsultantErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ConsultantRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

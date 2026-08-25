export type CompanyStatus = 'ACTIVE' | 'DISABLED';

export type CompanyContaAzulStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

/** Resumo operacional da Conta Azul na listagem. Sem tokens. */
export type CompanyContaAzulIntegration = {
  readonly status: CompanyContaAzulStatus;
  readonly lastSuccessfulSyncAt: string | null;
};

/** Registro público de Empresa exposto pela API administrativa. */
export type Company = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly status: CompanyStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deactivatedAt: string | null;
  readonly integration: CompanyContaAzulIntegration | null;
};

export type CompanyPagination = {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export type CompanyListResult = {
  readonly data: ReadonlyArray<Company>;
  readonly pagination: CompanyPagination;
};

export type CreateCompanyInput = {
  readonly name: string;
  readonly displayName: string;
};

export type UpdateCompanyInput = {
  readonly name?: string;
  readonly displayName?: string;
};

export type ListCompaniesParams = {
  readonly status?: CompanyStatus;
  readonly limit?: number;
  readonly offset?: number;
};

export type CompanyErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type CompanyRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unavailable';

export class CompaniesRequestError extends Error {
  readonly kind: CompanyRequestFailureKind;
  readonly details?: ReadonlyArray<CompanyErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: CompanyRequestFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<CompanyErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CompaniesRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

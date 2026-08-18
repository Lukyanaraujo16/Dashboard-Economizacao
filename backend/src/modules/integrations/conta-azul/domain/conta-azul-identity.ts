import type { ContaAzulExternalAccountMetadata } from './types.js';

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 255;
const MAX_EMAIL_LENGTH = 255;
const MAX_DOCUMENT_LENGTH = 32;

export class ContaAzulIdentityMappingError extends Error {
  readonly code = 'identity_incomplete' as const;

  constructor(message = 'A Conta Azul não retornou a identificação da empresa conectada.') {
    super(message);
    this.name = 'ContaAzulIdentityMappingError';
  }
}

export type ContaAzulConnectedCompany = {
  readonly externalAccountId: string;
  readonly externalCompanyName: string | null;
  readonly metadata: ContaAzulExternalAccountMetadata | null;
};

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

export function mapContaAzulConnectedCompany(payload: unknown): ContaAzulConnectedCompany {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ContaAzulIdentityMappingError();
  }

  const record = payload as Record<string, unknown>;
  const externalAccountId = readOptionalString(record.id_empresa, MAX_ID_LENGTH);
  if (!externalAccountId) {
    throw new ContaAzulIdentityMappingError();
  }

  const razaoSocial = readOptionalString(record.razao_social, MAX_NAME_LENGTH);
  const nomeFantasia = readOptionalString(record.nome_fantasia, MAX_NAME_LENGTH);
  const documento = readOptionalString(record.documento, MAX_DOCUMENT_LENGTH);
  const email = readOptionalString(record.email, MAX_EMAIL_LENGTH);

  const metadata: ContaAzulExternalAccountMetadata = {
    ...(documento ? { documento } : {}),
    ...(nomeFantasia ? { nomeFantasia } : {}),
    ...(email ? { email } : {}),
  };

  return {
    externalAccountId,
    externalCompanyName: razaoSocial ?? nomeFantasia ?? null,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

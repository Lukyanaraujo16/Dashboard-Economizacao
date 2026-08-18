import {
  formatPayloadDiagnostic,
  type ContaAzulPayloadDiagnostic,
} from './conta-azul-payload-diagnostic.js';

export class ContaAzulMappingError extends Error {
  readonly diagnostic?: ContaAzulPayloadDiagnostic;

  constructor(
    message = 'A Conta Azul retornou um payload inválido.',
    options?: { readonly diagnostic?: ContaAzulPayloadDiagnostic },
  ) {
    super(options?.diagnostic ? formatPayloadDiagnostic(options.diagnostic) : message);
    this.name = 'ContaAzulMappingError';
    this.diagnostic = options?.diagnostic;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readRequiredId(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ContaAzulMappingError(`Campo ${field} é obrigatório.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ContaAzulMappingError(`Campo ${field} é obrigatório.`);
  }
  if (trimmed.length > 128) {
    throw new ContaAzulMappingError(`Campo ${field} excede o tamanho permitido.`);
  }
  return trimmed;
}

export function readOptionalId(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return readRequiredId(value, field);
}

export function readRequiredName(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ContaAzulMappingError(`Campo ${field} é obrigatório.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ContaAzulMappingError(`Campo ${field} é obrigatório.`);
  }
  return trimmed.slice(0, 255);
}

export function readOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

export function readOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

export function readTotalItems(payload: Record<string, unknown>): number | null {
  const total = payload.itens_totais ?? payload.totalItems;
  if (typeof total === 'number' && Number.isInteger(total) && total >= 0) {
    return total;
  }
  return null;
}

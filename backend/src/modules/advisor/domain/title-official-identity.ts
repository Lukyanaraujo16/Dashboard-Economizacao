import { formatPresentedDay } from './compose-proactive-presentation.js';

export type OfficialTitleIdentity = {
  readonly counterpartyName: string | null;
  readonly description: string | null;
  readonly categoryName: string | null;
  readonly documentNumber: string | null;
};

const EMPTY_IDENTITY: OfficialTitleIdentity = {
  counterpartyName: null,
  description: null,
  categoryName: null,
  documentNumber: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function blankToNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function readOfficialTitleIdentity(supportingData: unknown): OfficialTitleIdentity {
  if (!isRecord(supportingData)) {
    return EMPTY_IDENTITY;
  }
  return {
    counterpartyName: blankToNull(supportingData.counterpartyName),
    description: blankToNull(supportingData.description),
    categoryName: blankToNull(supportingData.categoryName),
    documentNumber: blankToNull(supportingData.documentNumber),
  };
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'accent' }) === 0;
}

/**
 * Identificação humana só com campos oficiais já conhecidos.
 * Ausência vira o fallback de vencimento, sem nome nem natureza inventados.
 */
export function officialTitleIdentification(
  identity: OfficialTitleIdentity,
  dueDate: string,
): string {
  const party = identity.counterpartyName;
  const description = identity.description;
  const category = identity.categoryName;
  const documentNumber = identity.documentNumber;
  if (party && description && !sameText(party, description)) {
    return `${party} — ${description}`;
  }
  if (party && category && !sameText(party, category)) {
    return `${party} — ${category}`;
  }
  if (party) {
    return party;
  }
  if (description) {
    return description;
  }
  if (category) {
    return category;
  }
  if (documentNumber) {
    return documentNumber;
  }
  const day = formatPresentedDay(dueDate);
  return `título com vencimento em ${day ?? dueDate}`;
}

export function isFallbackTitleIdentification(identification: string): boolean {
  return identification.startsWith('título com vencimento em ');
}

export function officialTitleIdentityClause(
  identity: OfficialTitleIdentity,
  dueDate: string,
): string {
  const identification = officialTitleIdentification(identity, dueDate);
  const parts = [`identification: ${identification}`];
  if (identity.counterpartyName) {
    parts.push(`counterparty: ${identity.counterpartyName}`);
  }
  if (identity.description) {
    parts.push(`description: ${identity.description}`);
  }
  if (identity.categoryName) {
    parts.push(`category: ${identity.categoryName}`);
  }
  if (identity.documentNumber) {
    parts.push(`document: ${identity.documentNumber}`);
  }
  return parts.join('; ');
}

/** Copia só textos oficiais ainda ausentes. Não preenche lacuna com suposição. */
export function mergeOfficialTitleIdentity(
  supportingData: unknown,
  found: OfficialTitleIdentity,
): Record<string, unknown> {
  const base = isRecord(supportingData) ? { ...supportingData } : {};
  const current = readOfficialTitleIdentity(base);
  if (current.counterpartyName === null && found.counterpartyName) {
    base.counterpartyName = found.counterpartyName;
  }
  if (current.description === null && found.description) {
    base.description = found.description;
  }
  if (current.categoryName === null && found.categoryName) {
    base.categoryName = found.categoryName;
  }
  if (current.documentNumber === null && found.documentNumber) {
    base.documentNumber = found.documentNumber;
  }
  return base;
}

/** Visão enviada ao modelo: sem identificadores internos. */
export function publicTitleSupportingData(supportingData: unknown): unknown {
  if (!isRecord(supportingData)) {
    return supportingData;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(supportingData)) {
    if (key === 'id' || key.endsWith('Id')) {
      continue;
    }
    if (value === null || value === undefined || value === '') {
      continue;
    }
    next[key] = value;
  }
  return next;
}

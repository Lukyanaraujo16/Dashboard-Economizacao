import type { FinancialCategoryType, PartyProfile } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import {
  parseCivilDate,
  parseOptionalCivilDate,
  parseOptionalTimestamp,
} from './conta-azul-dates.js';
import { mapInstallmentStatus } from './conta-azul-installment-status.js';
import {
  ContaAzulMappingError,
  isRecord,
  readOptionalId,
  readOptionalInt,
  readOptionalString,
  readRequiredId,
  readRequiredName,
  readTotalItems,
} from './conta-azul-mapping.js';
import {
  describeReceivedShape,
  type ContaAzulPayloadDiagnostic,
} from './conta-azul-payload-diagnostic.js';
import { parseContaAzulMoney } from './conta-azul-money.js';

export type MappedFinancialCategory = {
  readonly externalId: string;
  readonly name: string;
  readonly type: FinancialCategoryType;
  readonly parentExternalId: string | null;
  readonly upstreamVersion: number | null;
};

export type MappedFinancialAccount = {
  readonly externalId: string;
  readonly name: string;
  readonly type: string;
  readonly active: boolean;
};

export type MappedParty = {
  readonly externalId: string;
  readonly name: string;
  readonly document: string | null;
  readonly active: boolean;
  readonly profiles: PartyProfile[];
};

export type MappedInstallment = {
  readonly externalId: string;
  readonly description: string | null;
  readonly dueDate: Date;
  readonly competenceDate: Date | null;
  readonly upstreamCreatedAt: Date | null;
  readonly upstreamUpdatedAt: Date | null;
  readonly status: ReturnType<typeof mapInstallmentStatus>['status'];
  readonly upstreamStatus: string | null;
  readonly total: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly externalPartyId: string | null;
  readonly categoryExternalIds: string[];
};

export type MappedPage<T> = {
  readonly items: T[];
  readonly totalItems: number | null;
};

function readItems(payload: unknown, keys: readonly string[]): unknown[] {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista da Conta Azul é inválida.');
  }
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  throw new ContaAzulMappingError('A lista da Conta Azul é inválida.');
}

function mapCategoryType(value: unknown): FinancialCategoryType {
  if (typeof value !== 'string') {
    return 'UNKNOWN';
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'RECEITA' || normalized === 'REVENUE') {
    return 'REVENUE';
  }
  if (normalized === 'DESPESA' || normalized === 'EXPENSE') {
    return 'EXPENSE';
  }
  return 'UNKNOWN';
}

function mapPartyProfile(value: unknown): PartyProfile | null {
  if (typeof value !== 'string') {
    return null;
  }
  switch (value.trim().toUpperCase()) {
    case 'CLIENTE':
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'FORNECEDOR':
    case 'SUPPLIER':
      return 'SUPPLIER';
    case 'TRANSPORTADORA':
    case 'CARRIER':
      return 'CARRIER';
    default:
      return null;
  }
}

function mapCategoryRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = readOptionalId(item.id, 'categorias.id');
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function mapFinancialCategoryPage(payload: unknown): MappedPage<MappedFinancialCategory> {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de categorias é inválida.');
  }
  const items = readItems(payload, ['itens', 'items']).map((item, index) => {
    if (!isRecord(item)) {
      throw new ContaAzulMappingError(`Categoria inválida na posição ${index}.`);
    }
    return {
      externalId: readRequiredId(item.id, 'categorias.id'),
      name: readRequiredName(item.nome, 'categorias.nome'),
      type: mapCategoryType(item.tipo),
      parentExternalId: readOptionalId(item.categoria_pai, 'categorias.categoria_pai'),
      upstreamVersion: readOptionalInt(item.versao),
    };
  });
  return { items, totalItems: readTotalItems(payload) };
}

export function mapFinancialAccountPage(payload: unknown): MappedPage<MappedFinancialAccount> {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de contas financeiras é inválida.');
  }
  const items = readItems(payload, ['itens', 'items']).map((item, index) => {
    if (!isRecord(item)) {
      throw new ContaAzulMappingError(`Conta financeira inválida na posição ${index}.`);
    }
    return {
      externalId: readRequiredId(item.id, 'conta-financeira.id'),
      name: readRequiredName(item.nome, 'conta-financeira.nome'),
      type: readRequiredName(item.tipo, 'conta-financeira.tipo'),
      active: item.ativo !== false,
    };
  });
  return { items, totalItems: readTotalItems(payload) };
}

function peopleMappingError(
  diagnostic: Omit<ContaAzulPayloadDiagnostic, 'resource'>,
): ContaAzulMappingError {
  return new ContaAzulMappingError('A lista de pessoas é inválida.', {
    diagnostic: { resource: 'pessoas', ...diagnostic },
  });
}

function readPeopleList(payload: Record<string, unknown>): unknown[] {
  const items = payload.items;
  if (Array.isArray(items)) {
    return items;
  }
  // Conta Azul Pessoas v1 pode retornar `items: null` quando não há registros;
  // homologado em ambiente real em 2026-08-18.
  if (items === null) {
    return [];
  }
  const itens = payload.itens;
  if (Array.isArray(itens)) {
    return itens;
  }
  const reported = items !== undefined ? items : itens !== undefined ? itens : undefined;
  const field = items !== undefined || itens === undefined ? 'items' : 'itens';
  throw peopleMappingError({
    field,
    expected: 'array',
    received: describeReceivedShape(reported),
  });
}

function readRequiredPartyId(value: unknown, index: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw peopleMappingError({
      field: 'id',
      index,
      expected: 'non-empty-string',
      received: describeReceivedShape(value),
    });
  }
  const trimmed = value.trim();
  if (trimmed.length > 128) {
    throw peopleMappingError({
      field: 'id',
      index,
      expected: 'non-empty-string',
      received: 'string',
    });
  }
  return trimmed;
}

function readRequiredPartyName(value: unknown, index: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw peopleMappingError({
      field: 'nome',
      index,
      expected: 'non-empty-string',
      received: describeReceivedShape(value),
    });
  }
  return value.trim().slice(0, 255);
}

export function mapPartyPage(payload: unknown): MappedPage<MappedParty> {
  if (!isRecord(payload)) {
    throw peopleMappingError({
      field: 'root',
      expected: 'object',
      received: describeReceivedShape(payload),
    });
  }
  const items = readPeopleList(payload).map((item, index) => {
    if (!isRecord(item)) {
      throw peopleMappingError({
        field: 'item',
        index,
        expected: 'object',
        received: describeReceivedShape(item),
      });
    }
    const profiles = Array.isArray(item.perfis)
      ? item.perfis
          .map((profile) => mapPartyProfile(profile))
          .filter((profile): profile is PartyProfile => profile !== null)
      : [];
    return {
      externalId: readRequiredPartyId(item.id, index),
      name: readRequiredPartyName(item.nome, index),
      document: readOptionalString(item.documento, 32),
      active: item.ativo !== false,
      profiles: [...new Set(profiles)],
    };
  });
  return { items, totalItems: readTotalItems(payload) };
}

function mapInstallmentItem(
  item: unknown,
  index: number,
  partyField: 'cliente' | 'fornecedor',
): MappedInstallment {
  if (!isRecord(item)) {
    throw new ContaAzulMappingError(`Parcela inválida na posição ${index}.`);
  }
  const party = isRecord(item[partyField]) ? item[partyField] : null;
  const mappedStatus = mapInstallmentStatus(item.status, item.status_traduzido);
  return {
    externalId: readRequiredId(item.id, 'parcelas.id'),
    description: readOptionalString(item.descricao, 500),
    dueDate: parseCivilDate(item.data_vencimento, 'data_vencimento'),
    competenceDate: parseOptionalCivilDate(item.data_competencia, 'data_competencia'),
    upstreamCreatedAt: parseOptionalTimestamp(item.data_criacao, 'data_criacao'),
    upstreamUpdatedAt: parseOptionalTimestamp(item.data_alteracao, 'data_alteracao'),
    status: mappedStatus.status,
    upstreamStatus: mappedStatus.upstreamStatus,
    total: parseContaAzulMoney(item.total, 'total'),
    paid: parseContaAzulMoney(item.pago, 'pago'),
    unpaid: parseContaAzulMoney(item.nao_pago, 'nao_pago'),
    externalPartyId: party ? readOptionalId(party.id, `${partyField}.id`) : null,
    categoryExternalIds: mapCategoryRefs(item.categorias),
  };
}

export function mapReceivablePage(payload: unknown): MappedPage<MappedInstallment> {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de contas a receber é inválida.');
  }
  const items = readItems(payload, ['itens', 'items']).map((item, index) =>
    mapInstallmentItem(item, index, 'cliente'),
  );
  return { items, totalItems: readTotalItems(payload) };
}

export function mapPayablePage(payload: unknown): MappedPage<MappedInstallment> {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de contas a pagar é inválida.');
  }
  const items = readItems(payload, ['itens', 'items']).map((item, index) =>
    mapInstallmentItem(item, index, 'fornecedor'),
  );
  return { items, totalItems: readTotalItems(payload) };
}

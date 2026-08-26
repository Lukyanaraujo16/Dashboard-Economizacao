import type {
  FinancialTransactionInstallmentKind,
  FinancialTransactionType,
} from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { parseCivilDate, parseOptionalOffsetTimestamp } from './conta-azul-dates.js';
import { ContaAzulMappingError, isRecord, readOptionalString, readRequiredId } from './conta-azul-mapping.js';
import { parseContaAzulMoney } from './conta-azul-money.js';

export class ContaAzulSettlementIdentityError extends ContaAzulMappingError {
  constructor(message = 'A composição monetária da baixa é inconsistente.') {
    super(message);
    this.name = 'ContaAzulSettlementIdentityError';
  }
}

export type MappedSettlement = {
  readonly externalId: string;
  readonly installmentExternalId: string;
  readonly transactionType: FinancialTransactionType;
  readonly occurredOn: Date;
  readonly grossAmount: Prisma.Decimal;
  readonly netAmount: Prisma.Decimal;
  readonly interestAmount: Prisma.Decimal;
  readonly fineAmount: Prisma.Decimal;
  readonly discountAmount: Prisma.Decimal;
  readonly feeAmount: Prisma.Decimal;
  readonly financialAccountExternalId: string | null;
  readonly paymentMethod: string | null;
  readonly upstreamVersion: number | null;
  readonly upstreamUpdatedAt: Date | null;
};

export type MapSettlementListResult = {
  readonly items: MappedSettlement[];
  readonly skippedInvalid: number;
  readonly skippedIdentityMismatch: number;
};

function readCompositionAmount(
  composition: Record<string, unknown>,
  field: string,
  required: boolean,
): Prisma.Decimal {
  const value = composition[field];
  if (!required && (value === null || value === undefined)) {
    return new Prisma.Decimal(0);
  }
  return parseContaAzulMoney(value, field);
}

function readFinancialAccountExternalId(value: unknown): string | null {
  if (typeof value === 'string') {
    return readOptionalString(value, 128);
  }
  if (isRecord(value) && typeof value.id === 'string') {
    return readOptionalString(value.id, 128);
  }
  return null;
}

function mapTransactionType(value: unknown): FinancialTransactionType {
  if (value === 'RECEITA') {
    return 'RECEIPT';
  }
  if (value === 'DESPESA') {
    return 'DISBURSEMENT';
  }
  throw new ContaAzulMappingError('Campo tipo_evento_financeiro é inválido.');
}

export function expectedSettlementNet(input: {
  readonly grossAmount: Prisma.Decimal;
  readonly interestAmount: Prisma.Decimal;
  readonly fineAmount: Prisma.Decimal;
  readonly discountAmount: Prisma.Decimal;
  readonly feeAmount: Prisma.Decimal;
}): Prisma.Decimal {
  return input.grossAmount
    .add(input.interestAmount)
    .add(input.fineAmount)
    .sub(input.discountAmount)
    .sub(input.feeAmount);
}

export function mapSettlement(raw: unknown): MappedSettlement {
  if (!isRecord(raw)) {
    throw new ContaAzulMappingError('A baixa da Conta Azul é inválida.');
  }
  const composition = isRecord(raw.valor_composicao) ? raw.valor_composicao : null;
  if (!composition) {
    throw new ContaAzulMappingError('Campo valor_composicao é obrigatório.');
  }
  if (!Object.prototype.hasOwnProperty.call(composition, 'valor_liquido')) {
    throw new ContaAzulMappingError('Campo valor_liquido é obrigatório.');
  }
  const upstreamVersion =
    typeof raw.versao === 'number' && Number.isInteger(raw.versao) ? raw.versao : null;
  const mapped: MappedSettlement = {
    externalId: readRequiredId(raw.id, 'id'),
    installmentExternalId: readRequiredId(raw.id_parcela, 'id_parcela'),
    transactionType: mapTransactionType(raw.tipo_evento_financeiro),
    occurredOn: parseCivilDate(raw.data_pagamento, 'data_pagamento'),
    grossAmount: readCompositionAmount(composition, 'valor_bruto', true),
    netAmount: readCompositionAmount(composition, 'valor_liquido', true),
    interestAmount: readCompositionAmount(composition, 'juros', false),
    fineAmount: readCompositionAmount(composition, 'multa', false),
    discountAmount: readCompositionAmount(composition, 'desconto', false),
    feeAmount: readCompositionAmount(composition, 'taxa', false),
    financialAccountExternalId: readFinancialAccountExternalId(raw.conta_financeira),
    paymentMethod: readOptionalString(raw.metodo_pagamento, 64),
    upstreamVersion,
    upstreamUpdatedAt: parseOptionalOffsetTimestamp(raw.atualizado_em, 'atualizado_em'),
  };
  const expected = expectedSettlementNet(mapped);
  if (!mapped.netAmount.eq(expected)) {
    throw new ContaAzulSettlementIdentityError(
      `Identidade monetária da baixa divergente: líquido ${mapped.netAmount.toFixed()} ≠ ${expected.toFixed()}.`,
    );
  }
  return mapped;
}

export function mapSettlementList(payload: unknown): MapSettlementListResult {
  if (!Array.isArray(payload)) {
    throw new ContaAzulMappingError('A lista de baixas da Conta Azul é inválida.');
  }
  const items: MappedSettlement[] = [];
  let skippedInvalid = 0;
  let skippedIdentityMismatch = 0;
  for (const raw of payload) {
    try {
      items.push(mapSettlement(raw));
    } catch (error) {
      if (error instanceof ContaAzulSettlementIdentityError) {
        skippedIdentityMismatch += 1;
      } else {
        skippedInvalid += 1;
      }
    }
  }
  return { items, skippedInvalid, skippedIdentityMismatch };
}

export function extractSearchInstallmentIds(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [];
  }
  const list = Array.isArray(payload.itens)
    ? payload.itens
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const ids: string[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      continue;
    }
    const id = item.id.trim();
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

export type LedgerInstallmentCandidate = {
  readonly kind: FinancialTransactionInstallmentKind;
  readonly externalId: string;
};

import { Prisma } from '../../../../generated/prisma/client.js';
import { parseCivilDate } from './conta-azul-dates.js';
import { ContaAzulMappingError, isRecord, readOptionalString, readRequiredId } from './conta-azul-mapping.js';
import { parseContaAzulMoney } from './conta-azul-money.js';

export type MappedFinancialTransfer = {
  readonly externalId: string;
  readonly occurredOn: Date;
  readonly amount: Prisma.Decimal;
  readonly sourceFinancialAccountExternalId: string;
  readonly destinationFinancialAccountExternalId: string;
  readonly description: string | null;
};

export type MapTransferListResult = {
  readonly items: MappedFinancialTransfer[];
  readonly skippedInvalid: number;
  readonly totalItems: number | null;
};

function readAccountId(quitacao: unknown, field: string): string {
  if (!isRecord(quitacao)) {
    throw new ContaAzulMappingError(`Campo ${field} é obrigatório.`);
  }
  const conta = quitacao.conta_financeira;
  if (typeof conta === 'string') {
    return readRequiredId(conta, `${field}.conta_financeira`);
  }
  if (isRecord(conta) && typeof conta.id === 'string') {
    return readRequiredId(conta.id, `${field}.conta_financeira.id`);
  }
  throw new ContaAzulMappingError(`Campo ${field}.conta_financeira.id é obrigatório.`);
}

export function mapFinancialTransfer(raw: unknown): MappedFinancialTransfer {
  if (!isRecord(raw)) {
    throw new ContaAzulMappingError('A transferência da Conta Azul é inválida.');
  }
  const amount = parseContaAzulMoney(raw.valor, 'valor');
  if (!amount.greaterThan(0)) {
    throw new ContaAzulMappingError('Campo valor deve ser maior que zero.');
  }
  const sourceFinancialAccountExternalId = readAccountId(raw.origem, 'origem');
  const destinationFinancialAccountExternalId = readAccountId(raw.destino, 'destino');
  if (sourceFinancialAccountExternalId === destinationFinancialAccountExternalId) {
    throw new ContaAzulMappingError('Origem e destino da transferência devem ser contas distintas.');
  }
  return {
    externalId: readRequiredId(raw.id, 'id'),
    occurredOn: parseCivilDate(raw.data, 'data'),
    amount,
    sourceFinancialAccountExternalId,
    destinationFinancialAccountExternalId,
    description: readOptionalString(raw.descricao, 255),
  };
}

export function mapFinancialTransferList(payload: unknown): MapTransferListResult {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de transferências da Conta Azul é inválida.');
  }
  const list = Array.isArray(payload.itens)
    ? payload.itens
    : Array.isArray(payload.items)
      ? payload.items
      : null;
  if (!list) {
    throw new ContaAzulMappingError('A lista de transferências da Conta Azul é inválida.');
  }
  const totalRaw = payload.itens_totais ?? payload.totalItems;
  const totalItems =
    typeof totalRaw === 'number' && Number.isInteger(totalRaw) && totalRaw >= 0 ? totalRaw : null;
  const items: MappedFinancialTransfer[] = [];
  let skippedInvalid = 0;
  for (const raw of list) {
    try {
      items.push(mapFinancialTransfer(raw));
    } catch {
      skippedInvalid += 1;
    }
  }
  return { items, skippedInvalid, totalItems };
}

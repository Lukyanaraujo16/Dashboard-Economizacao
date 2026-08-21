import { Prisma } from '../../../../generated/prisma/client.js';
import {
  ContaAzulMappingError,
  isRecord,
  readOptionalString,
  readRequiredId,
  readRequiredName,
  readTotalItems,
} from './conta-azul-mapping.js';
import { COST_CENTER_ALLOCATION_MONEY_EPSILON } from './conta-azul-cost-center-allocation-normalize.js';
import { ContaAzulMoneyError, parseContaAzulMoney } from './conta-azul-money.js';
import type { MappedPage } from './conta-azul-financial-mappers.js';

export type MappedCostCenter = {
  readonly externalId: string;
  readonly code: string | null;
  readonly name: string;
  readonly active: boolean;
};

export type MappedCostCenterAllocation = {
  readonly externalCostCenterId: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
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

export function mapCostCenterPage(payload: unknown): MappedPage<MappedCostCenter> {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('A lista de centros de custo é inválida.');
  }
  const items = readItems(payload, ['itens', 'items']).map((item, index) => {
    if (!isRecord(item)) {
      throw new ContaAzulMappingError(`Centro de custo inválido na posição ${index}.`);
    }
    return {
      externalId: readRequiredId(item.id, 'centro-de-custo.id'),
      code: readOptionalString(item.codigo, 64),
      name: readRequiredName(item.nome, 'centro-de-custo.nome'),
      active: item.ativo !== false,
    };
  });
  return { items, totalItems: readTotalItems(payload) };
}

/**
 * Extrai alocações de `evento.rateio[].rateio_centro_custo[]`.
 * Itens inválidos são ignorados; só falha o root estrutural do detalhe.
 * Mesmo centro em múltiplos rateios é agregado por `externalCostCenterId`.
 */
export function mapInstallmentCostCenterAllocations(
  detailPayload: unknown,
): MappedCostCenterAllocation[] {
  if (!isRecord(detailPayload)) {
    throw new ContaAzulMappingError('O detalhe da parcela é inválido.');
  }

  const evento = detailPayload.evento;
  if (evento === undefined || evento === null) {
    return [];
  }
  if (!isRecord(evento)) {
    throw new ContaAzulMappingError('O evento do detalhe da parcela é inválido.');
  }

  const rateio = evento.rateio;
  if (rateio === undefined || rateio === null) {
    return [];
  }
  if (!Array.isArray(rateio)) {
    return [];
  }

  const byExternalId = new Map<string, { name: string; amount: Prisma.Decimal }>();

  for (const rateioItem of rateio) {
    if (!isRecord(rateioItem)) {
      continue;
    }
    const centers = rateioItem.rateio_centro_custo;
    if (!Array.isArray(centers)) {
      continue;
    }
    for (const center of centers) {
      if (!isRecord(center)) {
        continue;
      }
      let externalId: string;
      let name: string;
      let amount: Prisma.Decimal;
      try {
        externalId = readRequiredId(center.id_centro_custo, 'rateio_centro_custo.id_centro_custo');
        name = readRequiredName(center.nome_centro_custo, 'rateio_centro_custo.nome_centro_custo');
        amount = parseContaAzulMoney(center.valor, 'rateio_centro_custo.valor');
      } catch (error) {
        if (error instanceof ContaAzulMappingError || error instanceof ContaAzulMoneyError) {
          continue;
        }
        throw error;
      }
      const existing = byExternalId.get(externalId);
      if (existing) {
        byExternalId.set(externalId, {
          name,
          amount: existing.amount.plus(amount),
        });
      } else {
        byExternalId.set(externalId, { name, amount });
      }
    }
  }

  return [...byExternalId.entries()].map(([externalCostCenterId, value]) => ({
    externalCostCenterId,
    name: value.name,
    amount: value.amount,
  }));
}

export type CostCenterAllocationReconcileStatus =
  | 'MATCH'
  | 'PARTIAL'
  | 'OVER'
  | 'NO_ALLOCATION';

/** Reexport do epsilon canônico (Decimal-safe). */
export { COST_CENTER_ALLOCATION_MONEY_EPSILON } from './conta-azul-cost-center-allocation-normalize.js';

export function reconcileCostCenterAllocationAmounts(input: {
  readonly total: Prisma.Decimal;
  readonly allocated: Prisma.Decimal;
}): CostCenterAllocationReconcileStatus {
  if (input.allocated.isZero()) {
    return 'NO_ALLOCATION';
  }
  const delta = input.allocated.minus(input.total).abs();
  if (delta.lessThanOrEqualTo(COST_CENTER_ALLOCATION_MONEY_EPSILON)) {
    return 'MATCH';
  }
  if (input.allocated.greaterThan(input.total.plus(COST_CENTER_ALLOCATION_MONEY_EPSILON))) {
    return 'OVER';
  }
  return 'PARTIAL';
}

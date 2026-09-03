import { Prisma } from '../../../../generated/prisma/client.js';
import {
  ContaAzulMappingError,
  isRecord,
} from './conta-azul-mapping.js';
import { parseContaAzulMoney } from './conta-azul-money.js';

export type MappedFinancialAccountCurrentBalance = {
  readonly balance: Prisma.Decimal;
};

/**
 * Contrato oficial Conta Azul:
 * GET /v1/conta-financeira/{id}/saldo-atual → { saldo_atual: number }
 * Nunca interpreta ausência/erro como R$ 0.
 */
export function mapFinancialAccountCurrentBalance(
  payload: unknown,
): MappedFinancialAccountCurrentBalance {
  if (!isRecord(payload)) {
    throw new ContaAzulMappingError('Resposta de saldo-atual inválida.');
  }
  if (!('saldo_atual' in payload) || payload.saldo_atual === null || payload.saldo_atual === undefined) {
    throw new ContaAzulMappingError('Resposta de saldo-atual sem campo saldo_atual.');
  }
  return {
    balance: parseContaAzulMoney(payload.saldo_atual, 'saldo_atual'),
  };
}

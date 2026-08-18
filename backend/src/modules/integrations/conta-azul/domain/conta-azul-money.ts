import { Prisma } from '../../../../generated/prisma/client.js';

export class ContaAzulMoneyError extends Error {
  constructor(message = 'Valor monetário inválido.') {
    super(message);
    this.name = 'ContaAzulMoneyError';
  }
}

const MAX_MONEY_ABS = new Prisma.Decimal('999999999999999.9999');
const MONEY_DECIMAL_PLACES = 4;

function decimalPlaces(value: Prisma.Decimal): number {
  const text = value.toFixed();
  const separator = text.indexOf('.');
  if (separator < 0) {
    return 0;
  }
  return text.length - separator - 1;
}

/**
 * Converte JSON da Conta Azul (number ou string) para Decimal(19,4).
 * Não arredonda: mais de 4 casas decimais é erro.
 */
export function parseContaAzulMoney(value: unknown, field: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ContaAzulMoneyError(`Campo ${field} está vazio.`);
    }
    try {
      decimal = new Prisma.Decimal(trimmed);
    } catch {
      throw new ContaAzulMoneyError(`Campo ${field} não é um valor monetário.`);
    }
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ContaAzulMoneyError(`Campo ${field} não é um número finito.`);
    }
    decimal = new Prisma.Decimal(value.toString());
  } else {
    throw new ContaAzulMoneyError(`Campo ${field} é obrigatório.`);
  }

  if (!decimal.isFinite()) {
    throw new ContaAzulMoneyError(`Campo ${field} não é um número finito.`);
  }
  if (decimalPlaces(decimal) > MONEY_DECIMAL_PLACES) {
    throw new ContaAzulMoneyError(`Campo ${field} excede 4 casas decimais.`);
  }
  if (decimal.abs().greaterThan(MAX_MONEY_ABS)) {
    throw new ContaAzulMoneyError(`Campo ${field} excede a precisão permitida.`);
  }
  return decimal;
}

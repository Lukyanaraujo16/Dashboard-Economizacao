import { BILLING_SERIES_FACT_KIND, BILLING_SERIES_MAX_MONTHS } from './billing-month-series.js';
import { formatAdvisorFactualBrl, formatAdvisorFactualMonth } from './advisor-factual-display.js';

const ABSENT = 'ABSENT';

function readLine(content: string, label: string): string | null {
  const pattern = new RegExp(`^${label.replace(/\./g, '\\.')}: (.+)$`, 'm');
  const match = pattern.exec(content);
  if (match === null || match[1] === undefined || match[1] === ABSENT) {
    return null;
  }
  return match[1];
}

function moneyLine(label: string, raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const formatted = formatAdvisorFactualBrl(raw);
  return formatted === null ? null : `${label}: ${formatted}.`;
}

/**
 * Preserva a cifra que `billing.value.month` já emitiu. Não recalcula o faturamento.
 */
export function composeAdvisorBillingMonthAnswer(content: string): string | null {
  const monthKey = readLine(content, 'monthKey');
  const billing = readLine(content, 'billing');
  const month = monthKey === null ? null : formatAdvisorFactualMonth(monthKey);
  const when = month ?? 'esse mês';
  if (billing === null) {
    return `Não há faturamento oficial disponível para ${when}.`;
  }
  const headline = moneyLine(`Faturamento em ${when}`, billing);
  if (headline === null) {
    return null;
  }
  const complements = [
    moneyLine('Recebido (entradas realizadas de caixa)', readLine(content, 'cash.realized.inflows')),
    moneyLine('A receber previsto do mês', readLine(content, 'cash.expected.receivables')),
    moneyLine('Pago (saídas realizadas de caixa)', readLine(content, 'cash.realized.outflows')),
    moneyLine('Resultado de caixa realizado', readLine(content, 'cash.realized.result')),
  ].filter((line): line is string => line !== null);
  return [headline, ...complements].join('\n');
}

export function composeAdvisorBillingSeriesAnswer(input: {
  readonly fact: Record<string, unknown>;
  readonly wantsAverage: boolean;
}): string | null {
  if (input.fact.factKind !== BILLING_SERIES_FACT_KIND) {
    return null;
  }
  const requested = typeof input.fact.requestedCount === 'number' ? input.fact.requestedCount : null;
  const valid = typeof input.fact.validCount === 'number' ? input.fact.validCount : null;
  const complete = input.fact.complete === true;
  const months = Array.isArray(input.fact.months) ? input.fact.months : null;
  if (requested === null || valid === null || months === null) {
    return null;
  }

  const available: string[] = [];
  const missing: string[] = [];
  for (const entry of months) {
    if (entry === null || typeof entry !== 'object') {
      return null;
    }
    const row = entry as Record<string, unknown>;
    const monthKey = typeof row.monthKey === 'string' ? row.monthKey : null;
    const label = monthKey === null ? null : formatAdvisorFactualMonth(monthKey);
    if (label === null) {
      return null;
    }
    if (row.available === true && typeof row.billing === 'string') {
      const line = moneyLine(`Faturamento em ${label}`, row.billing);
      if (line === null) {
        return null;
      }
      available.push(line);
    } else {
      missing.push(`${label} não possui cobertura suficiente de faturamento`);
    }
  }

  const lines = [
    ...available,
    ...missing.map((line) => `${line}.`),
    `Meses com faturamento oficial: ${valid} de ${requested}.`,
  ];

  if (input.wantsAverage && complete) {
    const average = typeof input.fact.average === 'string' ? input.fact.average : null;
    const averageLine = moneyLine(`Média dos ${requested} meses`, average);
    if (averageLine === null) {
      return null;
    }
    lines.push(averageLine);
  } else if (input.wantsAverage) {
    lines.push(
      `Por isso não consigo calcular com segurança a média completa dos últimos ${requested} meses.`,
    );
  }

  return lines.join('\n');
}

export function composeAdvisorBillingWindowLimitAnswer(count: number): string {
  return `A janela oficial de faturamento mensal vai até ${BILLING_SERIES_MAX_MONTHS} meses. Não consigo calcular a série dos últimos ${count} meses.`;
}

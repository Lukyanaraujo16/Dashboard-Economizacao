import { formatAdvisorFactualBrl } from './advisor-factual-display.js';

export const ADVISOR_DAILY_CASH_MOVEMENT_FACT_KIND = 'DAILY_CASH_MOVEMENTS';

export type AdvisorDailyCashMovementFactItem = {
  readonly displayLabel: string;
  readonly description: string | null;
  readonly categoryName: string | null;
  readonly amount: string;
  readonly costCenterLabel: string | null;
};

export type AdvisorDailyCashMovementFact = {
  readonly kind: typeof ADVISOR_DAILY_CASH_MOVEMENT_FACT_KIND;
  readonly status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_FOUND' | 'AMBIGUOUS';
  readonly date: string;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly costCenterName: string | null;
  readonly total: string | null;
  readonly returnedSum: string | null;
  readonly difference: string | null;
  readonly hasMore: boolean;
  readonly items: readonly AdvisorDailyCashMovementFactItem[];
};

function formatDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) {
    return date;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function money(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return formatAdvisorFactualBrl(value);
}

function line(item: AdvisorDailyCashMovementFactItem): string {
  const amount = money(item.amount) ?? item.amount;
  const parts = [item.displayLabel];
  const description = item.description?.trim() ?? '';
  if (description !== '' && description !== item.displayLabel) {
    parts.push(description);
  }
  if (item.categoryName !== null && item.categoryName.trim() !== '') {
    parts.push(item.categoryName.trim());
  }
  if (item.costCenterLabel !== null && item.costCenterLabel.trim() !== '') {
    parts.push(item.costCenterLabel.trim());
  }
  return `- ${parts.join(' — ')} — ${amount}`;
}

function scopeLabel(name: string | null): string {
  return name === null ? '' : ` em ${name}`;
}

/**
 * Lê o fato pronto. Não soma, não infere completude e não inventa contraparte.
 */
export function composeAdvisorDailyCashMovementAnswer(fact: AdvisorDailyCashMovementFact): string {
  const day = formatDay(fact.date);
  const place = scopeLabel(fact.costCenterName);
  if (fact.status === 'NOT_FOUND') {
    return `Não encontrei o centro de custo informado. Não vou usar outro centro no lugar.`;
  }
  if (fact.status === 'AMBIGUOUS') {
    return 'Há mais de um centro de custo compatível com o nome informado. Preciso que você indique qual.';
  }
  if (fact.status === 'UNAVAILABLE') {
    return `Não consigo detalhar os lançamentos de ${day}${place} com segurança nesse recorte.`;
  }

  const total = money(fact.total);
  const verb = fact.direction === 'INFLOW' ? 'entraram' : 'saíram';
  const noun = fact.direction === 'INFLOW' ? 'recebimentos' : 'pagamentos';
  if (total === null) {
    return `Não consigo detalhar os lançamentos de ${day}${place} com segurança nesse recorte.`;
  }
  if (fact.items.length === 0) {
    const none = fact.direction === 'INFLOW' ? 'não houve recebimentos' : 'não houve pagamentos';
    return `No dia ${day}${place} ${none}.`;
  }

  const lines = fact.items.map((item) => line(item)).join('\n');
  if (fact.status === 'PARTIAL' || fact.hasMore) {
    const shown = money(fact.returnedSum);
    const shownText = shown === null ? '' : ` Os lançamentos exibidos somam ${shown}.`;
    return `No dia ${day}${place} ${verb} ${total}.\n\nEstou mostrando apenas parte dos lançamentos deste dia.${shownText} Há mais lançamentos neste dia.\n\nParte dos ${noun}:\n${lines}`;
  }

  return `No dia ${day}${place} ${verb} ${total}.\n\nOs ${noun} foram:\n${lines}`;
}

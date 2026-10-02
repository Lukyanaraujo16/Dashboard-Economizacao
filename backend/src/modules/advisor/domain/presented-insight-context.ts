import {
  formatPresentedCents,
  formatPresentedDay,
  readPresentedTitleAmount,
} from './compose-proactive-presentation.js';

export type PresentedInsightFactSource = {
  readonly messageId: string;
  readonly insightType: string;
  readonly supportingData: unknown;
};

type TitleLine = {
  readonly kind: 'PAYABLE' | 'RECEIVABLE';
  readonly dueDate: string;
  readonly unpaidCents: bigint;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeTitleGroup(lines: readonly TitleLine[]): string {
  const ordered = [...lines].sort((left, right) => {
    const byDate = left.dueDate.localeCompare(right.dueDate);
    if (byDate !== 0) {
      return byDate;
    }
    return left.unpaidCents < right.unpaidCents ? -1 : left.unpaidCents > right.unpaidCents ? 1 : 0;
  });
  const kind = ordered[0]?.kind === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';
  const items = ordered.map((line, index) => {
    const day = formatPresentedDay(line.dueDate) ?? line.dueDate;
    return `${index + 1}. dueDate: ${line.dueDate}; displayDate: ${day}; amount: ${formatPresentedCents(line.unpaidCents)}`;
  });
  const largest = ordered.reduce((best, line) => (line.unpaidCents > best.unpaidCents ? line : best));
  const earliest = ordered[0]!;
  const total = ordered.reduce((sum, line) => sum + line.unpaidCents, 0n);
  const largestIndex = ordered.indexOf(largest) + 1;
  const parts = [
    `kind: ${kind}`,
    `quantidade: ${ordered.length}`,
    'itens em ordem de vencimento:',
    ...items,
    `maiorValor: item ${largestIndex}; dueDate: ${largest.dueDate}; amount: ${formatPresentedCents(largest.unpaidCents)}`,
    `vencePrimeiro: item 1; dueDate: ${earliest.dueDate}; amount: ${formatPresentedCents(earliest.unpaidCents)}`,
  ];
  const second = ordered[1];
  if (second) {
    parts.push(
      `segunda: item 2; dueDate: ${second.dueDate}; amount: ${formatPresentedCents(second.unpaidCents)}`,
    );
  }
  parts.push(`total: ${formatPresentedCents(total)}`);
  return parts.join('\n');
}

function describeGeneric(source: PresentedInsightFactSource): string {
  if (!isRecord(source.supportingData)) {
    return `insightType: ${source.insightType}`;
  }
  const fields = Object.entries(source.supportingData)
    .filter(([key, value]) => !/id/i.test(key) && (typeof value === 'string' || typeof value === 'number'))
    .map(([key, value]) => `${key}: ${String(value)}`);
  return [`insightType: ${source.insightType}`, ...fields].join('\n');
}

/**
 * Fatos oficiais das manifestações desta conversa.
 * Não inclui identificadores internos. ABSENT quando a conversa não tem vínculo.
 */
export function formatPresentedInsightFacts(
  messageIds: readonly string[],
  sources: readonly PresentedInsightFactSource[],
): string {
  const allowed = new Set(messageIds);
  const grouped = new Map<string, PresentedInsightFactSource[]>();
  for (const messageId of messageIds) {
    grouped.set(messageId, []);
  }
  for (const source of sources) {
    if (!allowed.has(source.messageId)) {
      continue;
    }
    grouped.get(source.messageId)?.push(source);
  }

  const sections: string[] = [];
  let index = 0;
  for (const messageId of messageIds) {
    const rows = grouped.get(messageId) ?? [];
    if (rows.length === 0) {
      continue;
    }
    index += 1;
    const titles = rows.flatMap((row) => {
      if (row.insightType !== 'TITLE_DUE_SOON') {
        return [];
      }
      const amount = readPresentedTitleAmount(row.supportingData);
      return amount === null ? [] : [amount];
    });
    const body =
      titles.length === rows.length && titles.length > 0
        ? describeTitleGroup(titles)
        : rows.map((row) => describeGeneric(row)).join('\n');
    sections.push(`Manifestação ${index}\n${body}`);
  }

  if (sections.length === 0) {
    return 'ABSENT';
  }
  return [
    'Fatos oficiais das manifestações já apresentadas nesta conversa. Não recalcule quantidade, datas, valores nem total.',
    ...sections,
  ].join('\n\n');
}

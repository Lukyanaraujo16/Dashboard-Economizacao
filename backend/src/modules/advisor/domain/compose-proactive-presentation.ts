export type ProactivePresentationSource = {
  readonly id: string;
  readonly insightType: string;
  readonly content: string;
  readonly supportingData: unknown;
};

export type ProactivePresentation = {
  readonly insightIds: readonly string[];
  readonly primaryInsightId: string;
  readonly content: string;
};

type TitleFact = {
  readonly insightId: string;
  readonly kind: 'PAYABLE' | 'RECEIVABLE';
  readonly dueDate: string;
  readonly unpaidCents: bigint;
};

function toCents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const whole = BigInt(match[1] ?? '0');
  const digits = match[2] ?? '';
  const frac = digits.padEnd(3, '0').slice(0, 3);
  const cents = BigInt(frac.slice(0, 2));
  const round = frac[2] !== undefined && frac[2] >= '5' ? 1n : 0n;
  return whole * 100n + cents + round;
}

function formatCents(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (cents % 100n).toString().padStart(2, '0');
  return `R$ ${whole},${frac}`;
}

function formatDay(dueDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) {
    return null;
  }
  return `${match[3]}/${match[2]}`;
}

function readTitleFact(insight: ProactivePresentationSource): TitleFact | null {
  if (insight.insightType !== 'TITLE_DUE_SOON' || !isRecord(insight.supportingData)) {
    return null;
  }
  const kind = insight.supportingData.titleKind;
  const dueDate = insight.supportingData.dueDate;
  const unpaid = insight.supportingData.unpaid;
  if (kind !== 'PAYABLE' && kind !== 'RECEIVABLE') {
    return null;
  }
  if (typeof dueDate !== 'string' || formatDay(dueDate) === null) {
    return null;
  }
  if (typeof unpaid !== 'string' && typeof unpaid !== 'number') {
    return null;
  }
  const unpaidCents = toCents(String(unpaid));
  if (unpaidCents === null) {
    return null;
  }
  return { insightId: insight.id, kind, dueDate, unpaidCents };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function composeTitleGroup(facts: readonly TitleFact[]): string {
  const kind = facts[0]?.kind;
  const label = kind === 'RECEIVABLE' ? 'contas a receber' : 'contas a pagar';
  const ordered = [...facts].sort((left, right) => {
    const byDate = left.dueDate.localeCompare(right.dueDate);
    if (byDate !== 0) {
      return byDate;
    }
    return left.unpaidCents < right.unpaidCents ? -1 : left.unpaidCents > right.unpaidCents ? 1 : 0;
  });
  const lines = ordered.map((fact) => {
    const day = formatDay(fact.dueDate) ?? fact.dueDate;
    return `• ${day} — ${formatCents(fact.unpaidCents)}`;
  });
  const total = ordered.reduce((sum, fact) => sum + fact.unpaidCents, 0n);
  return [
    `Identifiquei ${ordered.length} ${label} com vencimento nos próximos dias:`,
    '',
    ...lines,
    '',
    `Total: ${formatCents(total)}.`,
    '',
    'Vale acompanhar esses vencimentos.',
  ].join('\n');
}

/**
 * Agrupa só a comunicação de TITLE_DUE_SOON do mesmo tipo.
 * Os fatos permanecem individuais. O total é soma dos valores já persistidos.
 */
export function composeProactivePresentations(
  insights: readonly ProactivePresentationSource[],
): readonly ProactivePresentation[] {
  const consumed = new Set<string>();
  const presentations: ProactivePresentation[] = [];

  for (const insight of insights) {
    if (consumed.has(insight.id)) {
      continue;
    }
    const fact = readTitleFact(insight);
    if (fact) {
      const peers = insights.flatMap((candidate) => {
        if (consumed.has(candidate.id)) {
          return [];
        }
        const candidateFact = readTitleFact(candidate);
        return candidateFact && candidateFact.kind === fact.kind ? [candidateFact] : [];
      });
      if (peers.length >= 2) {
        presentations.push({
          insightIds: peers.map((peer) => peer.insightId),
          primaryInsightId: peers[0]?.insightId ?? insight.id,
          content: composeTitleGroup(peers),
        });
        for (const peer of peers) {
          consumed.add(peer.insightId);
        }
        continue;
      }
    }

    const content = insight.content.trim();
    if (content.length === 0) {
      continue;
    }
    presentations.push({
      insightIds: [insight.id],
      primaryInsightId: insight.id,
      content,
    });
    consumed.add(insight.id);
  }

  return presentations;
}

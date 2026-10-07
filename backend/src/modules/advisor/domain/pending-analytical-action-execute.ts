/**
 * Execução de PendingAnalyticalAction via tools allowlisted existentes.
 */
import type { AdvisorAnalyticalToolExecutor } from './advisor-analytical-tools.js';
import {
  buildToolArgumentsFromPendingStep,
  type PendingAnalyticalAction,
} from './pending-analytical-action.js';

export type PendingActionToolExecution = {
  readonly id: string;
  readonly name: string;
  readonly ok: boolean;
  readonly content: string;
  readonly resultCardinality?: number;
  readonly arguments: Record<string, unknown>;
};

export type PendingActionExecutionResult =
  | {
      readonly status: 'OK';
      readonly executions: readonly PendingActionToolExecution[];
      readonly snapshotOnly: boolean;
    }
  | {
      readonly status: 'PARTIAL_UNAVAILABLE';
      readonly executions: readonly PendingActionToolExecution[];
      readonly unavailable: readonly string[];
      readonly snapshotOnly: boolean;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly message: string;
      readonly snapshotOnly: boolean;
    };

export async function executePendingAnalyticalAction(input: {
  readonly action: PendingAnalyticalAction;
  readonly tenantId: string;
  readonly resolvedMonthKey: string;
  readonly analyticalTools: AdvisorAnalyticalToolExecutor;
  readonly now?: Date;
}): Promise<PendingActionExecutionResult> {
  const snapshotOnly = input.action.steps.every((step) => step.toolName === null);
  if (snapshotOnly) {
    return { status: 'OK', executions: [], snapshotOnly: true };
  }

  const executions: PendingActionToolExecution[] = [];
  const unavailable: string[] = [];
  let seq = 0;

  for (const step of input.action.steps) {
    if (step.toolName === null) {
      continue;
    }
    const available = input.analyticalTools.tools.some((tool) => tool.name === step.toolName);
    if (!available) {
      unavailable.push(step.toolName);
      continue;
    }
    const args = buildToolArgumentsFromPendingStep(step, input.resolvedMonthKey);
    if (args === null) {
      unavailable.push(step.toolName);
      continue;
    }
    seq += 1;
    const callId = `pending-${input.action.id.slice(0, 8)}-${seq}`;
    const result = await input.analyticalTools.execute({
      tenantId: input.tenantId,
      resolvedMonthKey: input.resolvedMonthKey,
      now: input.now,
      call: {
        id: callId,
        name: step.toolName,
        arguments: args,
      },
    });
    executions.push({
      id: result.id,
      name: result.name,
      ok: result.ok,
      content: result.content,
      resultCardinality: result.resultCardinality,
      arguments: args,
    });
  }

  if (executions.length === 0 && unavailable.length > 0) {
    return {
      status: 'UNAVAILABLE',
      message: `Ação pendente indisponível: ${unavailable.join(', ')}.`,
      snapshotOnly: false,
    };
  }
  if (unavailable.length > 0) {
    return {
      status: 'PARTIAL_UNAVAILABLE',
      executions,
      unavailable,
      snapshotOnly: false,
    };
  }
  return { status: 'OK', executions, snapshotOnly: false };
}

export function composePendingActionAnswer(input: {
  readonly action: PendingAnalyticalAction;
  readonly execution: PendingActionExecutionResult;
  readonly snapshotFactsText?: string | null;
}): string {
  if (input.execution.status === 'UNAVAILABLE') {
    return input.execution.message;
  }
  if (input.execution.snapshotOnly) {
    const facts = input.snapshotFactsText?.trim();
    if (facts !== undefined && facts !== '') {
      return [
        `Segue a leitura pedida (${input.action.objective}).`,
        '',
        'Use apenas os fatos oficiais CURRENT_SNAPSHOT / FINANCIAL_FACTS já carregados neste contexto.',
        facts.slice(0, 1_500),
      ].join('\n');
    }
    return `Posso usar a posição atual do Dashboard para "${input.action.objective}", mas os fatos de snapshot não vieram neste turno.`;
  }

  const lines: string[] = [`Resultado da ação aceita: ${input.action.objective}`];
  const hasPreload = input.action.steps.some((step) => step.toolName === null);
  if (hasPreload) {
    const facts = input.snapshotFactsText?.trim();
    if (facts !== undefined && facts !== '') {
      lines.push('- Posição / fatos oficiais de snapshot:');
      lines.push(facts.slice(0, 1_200));
    } else {
      lines.push(
        '- Posição de caixa: use os FINANCIAL_FACTS / CURRENT_SNAPSHOT já carregados neste contexto.',
      );
    }
  }
  for (const exec of input.execution.executions) {
    if (!exec.ok) {
      lines.push(`- ${exec.name}: indisponível nesta consulta.`);
      continue;
    }
    try {
      const parsed = JSON.parse(exec.content) as Record<string, unknown>;
      if (Array.isArray(parsed.lines)) {
        const rows = parsed.lines as Array<Record<string, unknown>>;
        lines.push(`- ${exec.name} (${rows.length} itens):`);
        for (const row of rows.slice(0, 20)) {
          const label =
            typeof row.description === 'string'
              ? row.description
              : typeof row.partyName === 'string'
                ? row.partyName
                : typeof row.label === 'string'
                  ? row.label
                  : 'item';
          const amount =
            typeof row.amount === 'string'
              ? row.amount
              : typeof row.unpaid === 'string'
                ? row.unpaid
                : null;
          const due = typeof row.dueDate === 'string' ? row.dueDate : null;
          const situation =
            typeof row.situation === 'string'
              ? row.situation
              : typeof row.installmentStatus === 'string'
                ? row.installmentStatus
                : null;
          lines.push(
            `  • ${label}${amount !== null ? ` — ${amount}` : ''}${due !== null ? ` — ${due}` : ''}${situation !== null ? ` — ${situation}` : ''}`,
          );
        }
        continue;
      }
      if (Array.isArray(parsed.categories)) {
        const cats = parsed.categories as Array<Record<string, unknown>>;
        lines.push(`- ${exec.name}:`);
        for (const cat of cats.slice(0, 10)) {
          lines.push(
            `  • ${String(cat.label ?? 'categoria')}${typeof cat.amount === 'string' ? ` — ${cat.amount}` : ''}`,
          );
        }
        continue;
      }
      lines.push(`- ${exec.name}: consulta concluída.`);
    } catch {
      lines.push(`- ${exec.name}: consulta concluída.`);
    }
  }
  if (input.execution.status === 'PARTIAL_UNAVAILABLE') {
    lines.push(
      `Limitação: partes indisponíveis (${input.execution.unavailable.join(', ')}).`,
    );
  }
  return lines.join('\n');
}

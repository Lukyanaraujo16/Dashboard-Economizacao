import type { IaToolRound } from '../../../infrastructure/ai/types.js';

/** Teto da coluna `ai_analytical_results.scope_summary`. */
export const ADVISOR_AGENT_SCOPE_SUMMARY_MAX_CHARS = 300;

/** Argumentos de tool que definem o escopo da resposta (o que o follow-up deve herdar). */
const SCOPE_KEYS: ReadonlyArray<readonly [label: string, keys: readonly string[]]> = [
  ['centro de custo', ['costCenter', 'costCenterQuery']],
  ['categoria', ['category', 'categoryQuery']],
  ['situação', ['situation']],
  ['mês', ['month', 'monthKey']],
  ['de', ['from']],
  ['até', ['to', 'endMonthKey']],
];

function clean(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  // Valor vem do modelo/usuário: sem quebras nem colchetes para não forjar outra anotação.
  const text = String(value).replace(/[\r\n[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, 80);
}

/**
 * Resumo determinístico dos filtros usados nas tool calls de uma resposta do agente,
 * ex.: "centro de custo = jacaraipe; mês = 2026-09". null quando nenhuma call tem escopo.
 * Sem centro/categoria nas calls = empresa inteira (dito explicitamente para o follow-up).
 */
export function summarizeAdvisorAgentScope(rounds: readonly IaToolRound[]): string | null {
  const calls = rounds.flatMap((round) => round.calls);
  if (calls.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const [label, keys] of SCOPE_KEYS) {
    const values = new Set<string>();
    for (const call of calls) {
      for (const key of keys) {
        const value = clean(call.arguments[key]);
        if (value !== null) {
          values.add(value);
        }
      }
    }
    if (values.size > 0) {
      parts.push(`${label} = ${[...values].join(', ')}`);
    }
  }
  if (!parts.some((part) => part.startsWith('centro de custo'))) {
    parts.unshift('centro de custo = empresa inteira');
  }
  return parts.join('; ').slice(0, ADVISOR_AGENT_SCOPE_SUMMARY_MAX_CHARS);
}

/** Anotação anexada só ao histórico enviado ao modelo; o usuário nunca a vê. */
export function formatAdvisorAgentScopeNote(summary: string): string {
  return `[Filtros usados nesta resposta: ${summary}]`;
}

/** Remove anotações de filtros que o modelo eventualmente copie para a resposta. */
export function stripAdvisorAgentScopeNotes(text: string): string {
  return text.replace(/\s*\[Filtros usados nesta resposta:[^\]]*\]/g, '').trim();
}

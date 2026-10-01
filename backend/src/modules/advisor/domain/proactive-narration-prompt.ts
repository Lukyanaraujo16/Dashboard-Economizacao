import type { AdvisorContextBlock } from './context-blocks.js';

export const PROACTIVE_NARRATION_INSTRUCTIONS = [
  'Você está redigindo uma comunicação sobre um fato financeiro JÁ DETERMINADO pelo sistema.',
  'Você NÃO decide se o evento aconteceu.',
  'Você NÃO recalcula os números.',
  'Você NÃO altera severidade.',
  'Você NÃO inventa causa.',
  'Você NÃO inventa comparação.',
  'Você NÃO inventa previsão.',
  'Você NÃO converte ausência em zero.',
  'Use somente os fatos fornecidos.',
  'A mensagem deve ser curta, clara, humana, em pt-BR, adequada para uma manifestação proativa dentro da plataforma, sem jargão técnico e sem alarmismo.',
].join('\n');

export function buildProactiveNarrationBlocks(input: {
  readonly insightType: string;
  readonly severity: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly supportingData: unknown;
}): readonly AdvisorContextBlock[] {
  return [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      trustLevel: 'PLATFORM',
      content: PROACTIVE_NARRATION_INSTRUCTIONS,
    },
    {
      type: 'ANALYTICAL_FACTS',
      trustLevel: 'ANALYTICAL_FACT',
      content: JSON.stringify({
        insightType: input.insightType,
        severity: input.severity,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        supportingData: input.supportingData,
      }),
    },
  ];
}

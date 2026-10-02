import type { AdvisorContextBlock } from './context-blocks.js';
import { publicTitleSupportingData } from './title-official-identity.js';

export const PROACTIVE_NARRATION_INSTRUCTIONS = [
  'Você está redigindo uma comunicação sobre um fato financeiro JÁ DETERMINADO pelo sistema.',
  'O destinatário é o gestor, administrador ou usuário financeiro da empresa que está usando o Dashboard Economização.',
  'Você informa esse usuário sobre um fato da própria empresa.',
  'Você NÃO está falando com cliente da empresa.',
  'Você NÃO está falando com fornecedor.',
  'Você NÃO está cobrando ninguém.',
  'Você NÃO está redigindo e-mail, WhatsApp, carta ou mensagem para encaminhamento.',
  'Você NÃO decide se o evento aconteceu.',
  'Você NÃO recalcula os números.',
  'Você NÃO altera severidade.',
  'Você NÃO inventa causa.',
  'Você NÃO inventa comparação.',
  'Você NÃO inventa previsão.',
  'Você NÃO inventa consequência, multa, risco ou inadimplência.',
  'Você NÃO afirma que o usuário precisa pagar, cobrar, cancelar ou renegociar, salvo se isso estiver explícito nos fatos.',
  'Não escreva "precisamos garantir que o pagamento seja realizado", "Certifique-se" ou "evitar complicações".',
  'Você NÃO converte ausência em zero.',
  'Você NÃO usa placeholder como [Seu Nome] ou [Nome da empresa].',
  'Você NÃO usa saudação formal, assinatura ou despedida.',
  'Não escreva Prezado, Atenciosamente, Caro cliente, Gostaríamos de informar ou Estamos à disposição.',
  'Use somente os fatos fornecidos.',
  'Se counterpartyName, description ou categoryName estiverem nos fatos, use exatamente esses textos para dizer qual é o título.',
  'Não invente fornecedor, funcionário, salário, beneficiário ou natureza quando esses campos não existirem.',
  'A mensagem deve ser curta, natural, profissional, direta, amigável e em pt-BR, sem jargão técnico e sem alarmismo.',
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
        supportingData: publicTitleSupportingData(input.supportingData),
      }),
    },
  ];
}

import type {
  ConsultantEmojiPreference,
  ConsultantProviderId,
  ConsultantTonePreset,
} from '../../services/admin/consultant.types';

export const CONSULTANT_WIZARD_STEPS = [
  { id: 1, label: 'Identidade' },
  { id: 2, label: 'Empresa' },
  { id: 3, label: 'Personalidade' },
  { id: 4, label: 'Instruções' },
  { id: 5, label: 'Conhecimento' },
] as const;

export type ConsultantWizardStepId = (typeof CONSULTANT_WIZARD_STEPS)[number]['id'];

export const TONE_PRESET_DESCRIPTIONS: Record<ConsultantTonePreset, string> = {
  PROFISSIONAL_OBJETIVO: 'Direto, claro e profissional, sem explicações desnecessárias.',
  CONSULTIVO: 'Analisa os números, explica impactos e sugere possíveis caminhos.',
  DIDATICO: 'Explica conceitos e números de forma simples e educativa.',
  AMIGAVEL: 'Conversa de forma próxima e acolhedora, mantendo clareza profissional.',
  EXECUTIVO: 'Respostas mais curtas, estratégicas e focadas em decisão.',
  PERSONALIZADO: 'Permite definir um estilo de comunicação específico.',
};

export const EMOJI_PREFERENCE_DESCRIPTIONS: Record<ConsultantEmojiPreference, string> = {
  NONE: 'Não usar emojis',
  MODERATE: 'Usar com moderação',
  FREE: 'Usar livremente',
};

export const SEGMENT_EXAMPLES =
  'Exemplos: clínica de estética, escritório de advocacia, distribuidora de materiais, loja de veículos, indústria alimentícia.';

export const KNOWLEDGE_EXAMPLES = [
  { title: 'Meta interna', text: 'Queremos faturar R$ 250 mil por mês.' },
  { title: 'Regra do negócio', text: 'Comissões são pagas todo dia 10.' },
  { title: 'Estrutura da empresa', text: 'A empresa possui duas unidades.' },
  { title: 'Sazonalidade', text: 'Janeiro e fevereiro costumam ter queda no número de atendimentos.' },
  { title: 'Estratégia', text: 'Nossa prioridade neste semestre é reduzir a inadimplência.' },
] as const;

export const INSTRUCTION_CHIPS = [
  {
    id: 'cash',
    label: 'Priorizar fluxo de caixa',
    text: 'Priorize fluxo de caixa nas análises.',
  },
  {
    id: 'direct',
    label: 'Ser mais direto',
    text: 'Seja mais direto e vá ao ponto.',
  },
  {
    id: 'terms',
    label: 'Explicar termos financeiros',
    text: 'Explique termos financeiros em linguagem simples.',
  },
  {
    id: 'overdue',
    label: 'Focar em inadimplência',
    text: 'Dê atenção especial à inadimplência.',
  },
] as const;

export function appendInstructionChip(current: string, addition: string): string {
  const trimmed = current.trim();
  if (trimmed.includes(addition)) {
    return current;
  }
  return trimmed.length === 0 ? addition : `${trimmed}\n${addition}`;
}

export function providerDisplayName(provider: ConsultantProviderId | null): string {
  if (provider === 'ANTHROPIC') {
    return 'Anthropic';
  }
  if (provider === 'OPENAI') {
    return 'OpenAI';
  }
  return 'Não definido';
}

export function toneDisplayName(preset: ConsultantTonePreset | null): string {
  switch (preset) {
    case 'PROFISSIONAL_OBJETIVO':
      return 'Profissional e objetivo';
    case 'CONSULTIVO':
      return 'Consultivo';
    case 'DIDATICO':
      return 'Didático';
    case 'AMIGAVEL':
      return 'Amigável';
    case 'EXECUTIVO':
      return 'Executivo';
    case 'PERSONALIZADO':
      return 'Personalizado';
    default:
      return 'Não definido';
  }
}

export function emojiDisplayName(preference: ConsultantEmojiPreference | null): string {
  if (preference === null) {
    return EMOJI_PREFERENCE_DESCRIPTIONS.MODERATE;
  }
  return EMOJI_PREFERENCE_DESCRIPTIONS[preference];
}

export function resolveDisplayedConsultantName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'Consultor';
}

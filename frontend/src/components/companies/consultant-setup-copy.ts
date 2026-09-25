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

export const EMOJI_PREFERENCE_HELPERS: Record<ConsultantEmojiPreference, string> = {
  NONE: 'Respostas totalmente sem emojis.',
  MODERATE: 'Usa emojis apenas quando ajudam na leitura.',
  FREE: 'Pode usar emojis naturalmente quando fizer sentido.',
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

export type ConsultantWizardDraftSnapshot = {
  readonly provider: ConsultantProviderId;
  readonly model: string;
  readonly consultantName: string;
  readonly businessSegment: string;
  readonly businessDescription: string;
  readonly adminPrompt: string;
  readonly tonePreset: ConsultantTonePreset;
  readonly tone: string;
  readonly emojiPreference: ConsultantEmojiPreference;
};

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
  return trimmed.length === 0 ? 'Consultor' : trimmed;
}

export function isDefaultConsultantName(name: string | null | undefined): boolean {
  return resolveDisplayedConsultantName(name) === 'Consultor';
}

export function wizardProgressPercent(
  step: ConsultantWizardStepId,
  reviewing: boolean,
): number {
  return reviewing ? 100 : step * 20;
}

export function wizardStepCopy(
  step: ConsultantWizardStepId,
  consultantName: string,
): { readonly title: string; readonly description: string } {
  const name = resolveDisplayedConsultantName(consultantName);
  const unnamed = isDefaultConsultantName(name);

  switch (step) {
    case 1:
      return {
        title: 'Vamos dar uma identidade ao seu Consultor',
        description: 'Escolha como ele será apresentado para sua equipe.',
      };
    case 2:
      return {
        title: unnamed
          ? 'Ajude o Consultor a conhecer sua empresa'
          : `Ajude ${name} a conhecer sua empresa`,
        description:
          'Conte o que a empresa faz, quem atende e quais características são importantes para que o Consultor interprete melhor o negócio.',
      };
    case 3:
      return {
        title: unnamed ? 'Como o Consultor deve se comunicar?' : `Como ${name} deve se comunicar?`,
        description: 'Defina o tom e o uso de emojis nas respostas.',
      };
    case 4:
      return {
        title: unnamed ? 'Defina como o Consultor deve agir' : `Defina como ${name} deve agir`,
        description:
          'Adicione orientações específicas para que o Consultor trabalhe de acordo com a realidade desta empresa.',
      };
    case 5:
      return {
        title: unnamed
          ? 'Ensine ao Consultor o que só sua empresa sabe'
          : `Ensine a ${name} o que só sua empresa sabe`,
        description: 'Adicione informações que não estão na Dashboard nem nos dados financeiros.',
      };
  }
}

export function isWizardDraftDirty(
  current: ConsultantWizardDraftSnapshot,
  baseline: ConsultantWizardDraftSnapshot,
): boolean {
  return (
    current.provider !== baseline.provider ||
    current.model !== baseline.model ||
    current.consultantName !== baseline.consultantName ||
    current.businessSegment !== baseline.businessSegment ||
    current.businessDescription !== baseline.businessDescription ||
    current.adminPrompt !== baseline.adminPrompt ||
    current.tonePreset !== baseline.tonePreset ||
    current.tone !== baseline.tone ||
    current.emojiPreference !== baseline.emojiPreference
  );
}

export function excerptKnowledge(content: string, maxLength = 120): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export type ConsultantSuccessKind =
  | 'created-active'
  | 'created-disabled'
  | 'edited-active'
  | 'edited-disabled';

export function consultantSuccessCopy(input: {
  readonly kind: ConsultantSuccessKind;
  readonly consultantName: string;
  readonly companyName: string;
}): { readonly title: string; readonly message: string; readonly complement: string } {
  const name = resolveDisplayedConsultantName(input.consultantName);
  const unnamed = isDefaultConsultantName(name);

  if (input.kind === 'created-active') {
    return {
      title: 'Tudo pronto!',
      message: unnamed
        ? 'O Consultor está configurado e disponível.'
        : `${name} está configurada e disponível.`,
      complement: `Seu Consultor já conhece as principais informações da ${input.companyName} e está pronto para ajudar sua equipe a interpretar os dados financeiros.`,
    };
  }

  if (input.kind === 'created-disabled') {
    return {
      title: 'Configuração concluída',
      message: unnamed ? 'O Consultor foi configurado com sucesso.' : `${name} foi configurada com sucesso.`,
      complement: 'O Consultor permanece desativado. Você poderá ativá-lo quando quiser.',
    };
  }

  if (input.kind === 'edited-active') {
    return {
      title: 'Alterações salvas',
      message: unnamed ? 'O Consultor foi atualizado com sucesso.' : `${name} foi atualizada com sucesso.`,
      complement: unnamed
        ? 'O Consultor continua ativo e disponível.'
        : `${name} continua ativa e disponível.`,
    };
  }

  return {
    title: 'Alterações salvas',
    message: unnamed ? 'O Consultor foi atualizado com sucesso.' : `${name} foi atualizada com sucesso.`,
    complement: unnamed ? 'O Consultor permanece desativado.' : `${name} permanece desativada.`,
  };
}

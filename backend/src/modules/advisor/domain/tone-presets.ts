import { AdvisorDomainError } from './advisor-domain-error.js';
import { AI_TONE_PRESETS, type AiTonePreset } from './types.js';

export const DEFAULT_TONE_PRESET: AiTonePreset = 'PROFISSIONAL_OBJETIVO';

export const AI_TONE_PRESET_LABELS: Record<AiTonePreset, string> = {
  PROFISSIONAL_OBJETIVO: 'Profissional e objetivo',
  CONSULTIVO: 'Consultivo',
  DIDATICO: 'Didático',
  AMIGAVEL: 'Amigável',
  EXECUTIVO: 'Executivo',
  PERSONALIZADO: 'Personalizado',
};

/**
 * Instruções de tom controladas pelo backend.
 * O frontend nunca é a fonte autoritativa destas frases.
 */
export const AI_TONE_PRESET_INSTRUCTIONS: Record<Exclude<AiTonePreset, 'PERSONALIZADO'>, string> = {
  PROFISSIONAL_OBJETIVO:
    'Fale de forma profissional, direta e objetiva. Priorize clareza e precisão. Evite floreio e informalidade.',
  CONSULTIVO:
    'Fale como um consultor financeiro: contextualize o número, explique implicações práticas e sugira o próximo ponto de atenção sem inventar dados.',
  DIDATICO:
    'Explique com linguagem acessível. Defina termos técnicos quando necessário e organize a resposta em passos curtos, sem simplificar os fatos oficiais.',
  AMIGAVEL:
    'Seja cordial e próximo, sem perder rigor. Use tom acolhedor, evite gírias e não transforme o texto em conversa casual demais.',
  EXECUTIVO:
    'Seja sucinto e voltado à decisão. Comece pelo essencial, use frases curtas e evite detalhes que não mudam a leitura do resultado.',
};

export function isAiTonePreset(value: string): value is AiTonePreset {
  return (AI_TONE_PRESETS as readonly string[]).includes(value);
}

export function assertAiTonePreset(value: string): AiTonePreset {
  if (!isAiTonePreset(value)) {
    throw new AdvisorDomainError(
      'AI_TONE_PRESET_INVALID',
      'Preset de tom do Consultor é inválido.',
    );
  }
  return value;
}

export function resolveToneInstruction(
  preset: AiTonePreset | null | undefined,
  customTone: string | null | undefined,
): string {
  const resolved = preset && isAiTonePreset(preset) ? preset : DEFAULT_TONE_PRESET;
  if (resolved === 'PERSONALIZADO') {
    const custom = customTone?.trim() ?? '';
    if (custom.length > 0) {
      return custom;
    }
    return AI_TONE_PRESET_INSTRUCTIONS.PROFISSIONAL_OBJETIVO;
  }
  return AI_TONE_PRESET_INSTRUCTIONS[resolved];
}

export function toPublicTonePresetOptions(): ReadonlyArray<{
  readonly id: AiTonePreset;
  readonly label: string;
}> {
  return AI_TONE_PRESETS.map((id) => ({
    id,
    label: AI_TONE_PRESET_LABELS[id],
  }));
}

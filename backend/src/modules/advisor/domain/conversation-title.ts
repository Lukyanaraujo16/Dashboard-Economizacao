export const DEFAULT_CONVERSATION_TITLE = 'Nova conversa';
export const CONVERSATION_TITLE_MAX_LENGTH = 80;

const LEADING_PREFIXES = [
  /^qual foi o meu\s+/i,
  /^qual foi a minha\s+/i,
  /^qual foi meu\s+/i,
  /^qual foi minha\s+/i,
  /^qual foi o\s+/i,
  /^qual foi a\s+/i,
  /^qual foi\s+/i,
  /^qual é o meu\s+/i,
  /^qual é a minha\s+/i,
  /^qual é meu\s+/i,
  /^qual é o\s+/i,
  /^qual é a\s+/i,
  /^qual é\s+/i,
  /^quais são os\s+/i,
  /^quais são as\s+/i,
  /^quais são\s+/i,
  /^quanto foi o\s+/i,
  /^quanto foi\s+/i,
  /^como (está|foi|estão)\s+/i,
  /^me (diga|informe|mostre)\s+/i,
];

/**
 * Título determinístico a partir da primeira pergunta.
 * Sem chamada extra ao provedor de IA.
 */
export function deriveConsultantConversationTitle(
  question: string,
  maxLength: number = CONVERSATION_TITLE_MAX_LENGTH,
): string {
  let title = question.trim().replace(/\s+/g, ' ');
  title = title.replace(/[?!]+$/g, '').trim();

  for (const prefix of LEADING_PREFIXES) {
    title = title.replace(prefix, '');
  }

  title = title.trim();
  if (title.length === 0) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > maxLength) {
    return `${title.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return title;
}

import type { AdvisorContextBlock } from '../../modules/advisor/domain/context-blocks.js';

export function formatDelimitedBlock(block: AdvisorContextBlock): string {
  return `[${block.trustLevel} ${block.type}]\n${block.content}`;
}

export function isSystemContextBlock(block: AdvisorContextBlock): boolean {
  return block.type === 'PLATFORM_INSTRUCTIONS' || block.type === 'TENANT_PROFILE';
}

export function composeSystemText(blocks: readonly AdvisorContextBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'PLATFORM_INSTRUCTIONS') {
      parts.push(block.content);
    } else if (block.type === 'TENANT_PROFILE') {
      parts.push(formatDelimitedBlock(block));
    }
  }
  return parts.join('\n\n');
}

export type ParsedConversationTurn = {
  readonly role: 'user' | 'assistant';
  readonly text: string;
};

const CONVERSATION_ROLE_LINE = /^(?:\[)?(USER|CONSULTANT)(?:\])?\s*:\s*(.*)$/;

/**
 * Parse simples de CONVERSATION_HISTORY.
 * Aceita turnos `USER:` / `CONSULTANT:` (linhas seguintes pertencem ao turno atual).
 * Sem marcadores de papel, retorna null para o adapter mandar o bloco delimitado.
 */
export function tryParseConversationTurns(content: string): ParsedConversationTurn[] | null {
  const lines = content.split(/\r?\n/);
  const turns: ParsedConversationTurn[] = [];
  let currentRole: ParsedConversationTurn['role'] | null = null;
  let currentParts: string[] = [];

  const flush = (): void => {
    if (currentRole === null) {
      return;
    }
    const text = currentParts.join('\n').trim();
    if (text) {
      turns.push({ role: currentRole, text });
    }
    currentRole = null;
    currentParts = [];
  };

  for (const line of lines) {
    const match = CONVERSATION_ROLE_LINE.exec(line);
    if (match) {
      flush();
      currentRole = match[1] === 'CONSULTANT' ? 'assistant' : 'user';
      currentParts = [match[2] ?? ''];
      continue;
    }
    if (currentRole !== null) {
      currentParts.push(line);
    }
  }
  flush();

  return turns.length > 0 ? turns : null;
}

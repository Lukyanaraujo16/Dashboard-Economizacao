import { describe, expect, it } from 'vitest';

import { tryParseConversationTurns } from '../src/infrastructure/ai/context-block-mapping.js';

describe('histórico com manifestação proativa', () => {
  it('trata a mensagem SYSTEM como fala da Lia', () => {
    const turns = tryParseConversationTurns(
      [
        'HISTORY_UNTRUSTED: contexto conversacional.',
        'SYSTEM: Identifiquei **3 contas a pagar**',
        '- **03/10** — R$ 250,00',
        'USER: Qual dessas contas tem o maior valor?',
      ].join('\n'),
    );
    expect(turns).toEqual([
      {
        role: 'assistant',
        text: 'Identifiquei **3 contas a pagar**\n- **03/10** — R$ 250,00',
      },
      { role: 'user', text: 'Qual dessas contas tem o maior valor?' },
    ]);
  });
});

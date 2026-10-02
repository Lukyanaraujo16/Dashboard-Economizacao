import { describe, expect, it } from 'vitest';

import { formatPresentedInsightFacts } from '../src/modules/advisor/domain/presented-insight-context.js';
import {
  mergeOfficialTitleIdentity,
  officialTitleIdentification,
  readOfficialTitleIdentity,
} from '../src/modules/advisor/domain/title-official-identity.js';

const messageId = 'message-1';

function title(
  dueDate: string,
  unpaid: string,
  identity: Record<string, string> = {},
) {
  return {
    messageId,
    insightType: 'TITLE_DUE_SOON',
    supportingData: {
      titleKind: 'PAYABLE',
      dueDate,
      unpaid,
      ...identity,
    },
  };
}

describe('identificação oficial do título', () => {
  it('maior título traz valor e identificação oficial', () => {
    const facts = formatPresentedInsightFacts(
      [messageId],
      [
        title('2026-10-03', '250.00', { counterpartyName: 'Fornecedor Pequeno' }),
        title('2026-10-05', '2150.20', {
          counterpartyName: 'João da Silva',
          description: 'Salário',
        }),
        title('2026-10-04', '1550.24', { counterpartyName: 'Outro' }),
      ],
    );
    expect(facts).toContain(
      'maiorValor: item 3; dueDate: 2026-10-05; amount: R$ 2.150,20; identification: João da Silva — Salário; counterparty: João da Silva; description: Salário',
    );
  });

  it('título que vence primeiro traz vencimento e identificação', () => {
    const facts = formatPresentedInsightFacts(
      [messageId],
      [
        title('2026-10-05', '2150.20', { counterpartyName: 'João da Silva' }),
        title('2026-10-03', '250.00', { description: 'Energia Elétrica' }),
      ],
    );
    expect(facts).toContain(
      'vencePrimeiro: item 1; dueDate: 2026-10-03; amount: R$ 250,00; identification: Energia Elétrica; description: Energia Elétrica',
    );
  });

  it('expõe a contraparte oficial para a pergunta de quem é', () => {
    const facts = formatPresentedInsightFacts(
      [messageId],
      [title('2026-10-05', '2150.20', { counterpartyName: 'João da Silva' })],
    );
    expect(facts).toContain('counterparty: João da Silva');
    expect(facts).not.toContain('description:');
    expect(facts).not.toContain('Salário');
  });

  it('usa fallback neutro e não inventa nome nem natureza', () => {
    const identity = readOfficialTitleIdentity({ titleKind: 'PAYABLE', externalId: 'segredo' });
    expect(officialTitleIdentification(identity, '2026-10-05')).toBe(
      'título com vencimento em 05/10',
    );
    const facts = formatPresentedInsightFacts([messageId], [title('2026-10-05', '2150.20')]);
    expect(facts).toContain('identification: título com vencimento em 05/10');
    expect(facts).not.toContain('counterparty:');
    expect(facts).not.toContain('João');
    expect(facts).not.toContain('description:');
    expect(facts).not.toContain('segredo');
  });

  it('escolhe o maior entre dois valores diferentes', () => {
    const facts = formatPresentedInsightFacts(
      [messageId],
      [
        title('2026-10-04', '10.00', { counterpartyName: 'Menor' }),
        title('2026-10-04', '20.00', { counterpartyName: 'Maior' }),
      ],
    );
    expect(facts).toContain('maiorValor: item 2; dueDate: 2026-10-04; amount: R$ 20,00');
    expect(facts).toContain('counterparty: Maior');
    expect(facts).toContain('quantidade: 2');
  });

  it('não preenche identificação ausente na mescla', () => {
    const merged = mergeOfficialTitleIdentity(
      { titleKind: 'PAYABLE', dueDate: '2026-10-05', unpaid: '10.00' },
      {
        counterpartyName: null,
        description: null,
        categoryName: null,
        documentNumber: null,
      },
    );
    expect(merged).not.toHaveProperty('counterpartyName');
    expect(merged).not.toHaveProperty('description');
  });

  it('nova conversa sem mensagens não herda títulos', () => {
    expect(formatPresentedInsightFacts([], [title('2026-10-05', '2150.20', { counterpartyName: 'João da Silva' })])).toBe(
      'ABSENT',
    );
  });
});

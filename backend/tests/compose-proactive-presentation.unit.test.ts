import { describe, expect, it } from 'vitest';

import { composeProactivePresentations } from '../src/modules/advisor/domain/compose-proactive-presentation.js';

function title(
  id: string,
  kind: 'PAYABLE' | 'RECEIVABLE',
  dueDate: string,
  unpaid: string,
  content = `narrativa individual ${id}`,
) {
  return {
    id,
    insightType: 'TITLE_DUE_SOON',
    content,
    supportingData: {
      titleKind: kind,
      externalId: id,
      dueDate,
      unpaid,
      minimumAmount: '5000.0000',
      daysAhead: 3,
      status: 'OPEN',
    },
  };
}

describe('apresentação consolidada de títulos', () => {
  it('mantém um único TITLE_DUE_SOON na narrativa individual', () => {
    const [presentation] = composeProactivePresentations([
      title('a', 'PAYABLE', '2026-10-05', '2150.20', 'Há uma conta a pagar.'),
    ]);
    expect(presentation?.insightIds).toEqual(['a']);
    expect(presentation?.content).toBe('Há uma conta a pagar.');
    expect(presentation?.content).not.toContain('Total:');
  });

  it('agrupa três contas a pagar e soma o total na aplicação', () => {
    const [presentation] = composeProactivePresentations([
      title('c', 'PAYABLE', '2026-10-05', '2150.20'),
      title('a', 'PAYABLE', '2026-10-03', '250.00'),
      title('b', 'PAYABLE', '2026-10-04', '1550.24'),
    ]);
    expect(presentation?.insightIds).toEqual(['c', 'a', 'b']);
    expect(presentation?.content).toContain('Identifiquei **3 contas a pagar**');
    expect(presentation?.content).toContain('- **03/10** — R$ 250,00');
    expect(presentation?.content).toContain('- **04/10** — R$ 1.550,24');
    expect(presentation?.content).toContain('- **05/10** — R$ 2.150,20');
    expect(presentation?.content).toContain('**Total: R$ 3.950,44**');
    expect(presentation?.content).not.toContain('narrativa individual');
  });

  it('agrupa contas a receber sem misturar com contas a pagar', () => {
    const presentations = composeProactivePresentations([
      title('p1', 'PAYABLE', '2026-10-03', '250.00'),
      title('r1', 'RECEIVABLE', '2026-10-03', '100.00'),
      title('p2', 'PAYABLE', '2026-10-04', '100.00'),
      title('r2', 'RECEIVABLE', '2026-10-06', '50.50'),
      title('r3', 'RECEIVABLE', '2026-10-05', '20.00'),
    ]);
    expect(presentations).toHaveLength(2);
    const payable = presentations.find((item) => item.content.includes('contas a pagar'));
    const receivable = presentations.find((item) => item.content.includes('contas a receber'));
    expect(payable?.insightIds).toEqual(['p1', 'p2']);
    expect(payable?.content).toContain('**Total: R$ 350,00**');
    expect(receivable?.insightIds).toEqual(['r1', 'r2', 'r3']);
    expect(receivable?.content).toContain('Identifiquei **3 contas a receber**');
    expect(receivable?.content).toContain('- **03/10** — R$ 100,00');
    expect(receivable?.content).toContain('- **05/10** — R$ 20,00');
    expect(receivable?.content).toContain('- **06/10** — R$ 50,50');
    expect(receivable?.content).toContain('**Total: R$ 170,50**');
  });

  it('não agrupa meta e teto nem inventa soma', () => {
    const presentations = composeProactivePresentations([
      {
        id: 'g80',
        insightType: 'REVENUE_GOAL_PERCENTAGE',
        content: 'Seu faturamento passou de 80%.',
        supportingData: { percentage: 80 },
      },
      {
        id: 'g90',
        insightType: 'REVENUE_GOAL_PERCENTAGE',
        content: 'Seu faturamento passou de 90%.',
        supportingData: { percentage: 90 },
      },
    ]);
    expect(presentations).toHaveLength(2);
    expect(presentations.map((item) => item.content)).toEqual([
      'Seu faturamento passou de 80%.',
      'Seu faturamento passou de 90%.',
    ]);
  });
});

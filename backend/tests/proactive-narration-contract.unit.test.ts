import { describe, expect, it } from 'vitest';

import {
  PROACTIVE_NARRATION_INSTRUCTIONS,
  buildProactiveNarrationBlocks,
} from '../src/modules/advisor/domain/proactive-narration-prompt.js';

describe('contrato da narração proativa', () => {
  it('define o gestor da empresa como destinatário e proíbe cobrança, carta e recálculo', () => {
    const text = PROACTIVE_NARRATION_INSTRUCTIONS;
    expect(text).toContain('gestor, administrador ou usuário financeiro');
    expect(text).toContain('Dashboard Economização');
    expect(text).toContain('fato da própria empresa');
    expect(text).toContain('NÃO está falando com cliente');
    expect(text).toContain('NÃO está falando com fornecedor');
    expect(text).toContain('NÃO está cobrando');
    expect(text).toContain('e-mail, WhatsApp, carta');
    expect(text).toContain('[Seu Nome]');
    expect(text).toContain('assinatura');
    expect(text).toContain('NÃO recalcula');
    expect(text).toContain('NÃO inventa causa');
    expect(text).toContain('NÃO inventa consequência');
    expect(text).toContain('precisa pagar, cobrar, cancelar ou renegociar');
    expect(text).toContain('precisamos garantir que o pagamento seja realizado');
    expect(text).toContain('Certifique-se');
    expect(text).toContain('Prezado');
    expect(text).toContain('Atenciosamente');
  });

  it('entrega os fatos prontos e não pede conta ao modelo', () => {
    const blocks = buildProactiveNarrationBlocks({
      insightType: 'TITLE_DUE_SOON',
      severity: 'ATTENTION',
      periodStart: '2026-10-05',
      periodEnd: '2026-10-05',
      supportingData: { titleKind: 'PAYABLE', unpaid: '2150.20', dueDate: '2026-10-05' },
    });
    expect(blocks[0]?.content).toBe(PROACTIVE_NARRATION_INSTRUCTIONS);
    expect(blocks[1]?.type).toBe('ANALYTICAL_FACTS');
    expect(blocks[1]?.content).toContain('"unpaid":"2150.20"');
    expect(blocks.map((block) => block.content).join('\n')).toContain('NÃO recalcula');
  });

  it('entrega o nome oficial do título e omite identificador interno', () => {
    const blocks = buildProactiveNarrationBlocks({
      insightType: 'TITLE_DUE_SOON',
      severity: 'ATTENTION',
      periodStart: '2026-10-05',
      periodEnd: '2026-10-05',
      supportingData: {
        titleKind: 'PAYABLE',
        unpaid: '2150.20',
        dueDate: '2026-10-05',
        externalId: 'conta-azul-id',
        counterpartyName: 'João da Silva',
        description: 'Salário',
      },
    });
    const facts = blocks[1]?.content ?? '';
    expect(facts).toContain('João da Silva');
    expect(facts).toContain('Salário');
    expect(facts).not.toContain('conta-azul-id');
    expect(facts).not.toContain('externalId');
  });
});

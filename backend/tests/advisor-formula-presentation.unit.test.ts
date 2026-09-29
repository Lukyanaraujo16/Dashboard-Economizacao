import { describe, expect, it } from 'vitest';

import {
  ADVISOR_PLATFORM_INSTRUCTIONS,
  advisorTextLooksLikeLatexMath,
  createBuildAdvisorContext,
  type BuildAdvisorContextDependencies,
  type AiTenantSettingsRecord,
} from '../src/modules/advisor/index.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';

describe('F13.8.2C.2 formula presentation contract', () => {
  it('PLATFORM proíbe LaTeX e exige fórmula em texto/Markdown comum', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('APRESENTAÇÃO DE FÓRMULAS:');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Não use LaTeX');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('renderer matemático');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('texto/Markdown comum');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('hipotéticos');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('FACTS oficiais');
    // Preserva autoridade financeira / documental.
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('DOCUMENT_KNOWLEDGE');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('FINANCIAL_FACTS');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain(
      'A pergunta atual do usuário (USER_QUESTION) é a autoridade principal',
    );
  });

  it('detector reconhece LaTeX deliberado e ignora R$ monetário', () => {
    expect(
      advisorTextLooksLikeLatexMath(
        String.raw`\[ \text{Meses de caixa} = \frac{\text{Caixa}}{\text{Despesas}} \]`,
      ),
    ).toBe(true);
    expect(advisorTextLooksLikeLatexMath(String.raw`$$ x = \frac{a}{b} $$`)).toBe(true);
    expect(advisorTextLooksLikeLatexMath(String.raw`resultado = \text{saldo}`)).toBe(true);
    expect(
      advisorTextLooksLikeLatexMath(
        'Meses de reserva = caixa disponível ÷ despesas fixas mensais. Ex.: R$ 60 mil.',
      ),
    ).toBe(false);
    expect(advisorTextLooksLikeLatexMath('Faturamento: R$ 224.790,30')).toBe(false);
  });

  it('Context Builder entrega o contrato de fórmulas no PLATFORM ao provider', async () => {
    const deps: BuildAdvisorContextDependencies = {
      settings: {
        async findSettingsByTenant() {
          return {
            id: 's',
            tenantId: 'tenant-a',
            provider: 'OPENAI',
            model: 'gpt-4o-mini',
            businessSegment: null,
            businessDescription: null,
            consultantName: null,
            adminPrompt: null,
            tonePreset: 'PROFISSIONAL_OBJETIVO',
            tone: 'objetivo',
            emojiPreference: 'MODERATE',
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
          } satisfies AiTenantSettingsRecord;
        },
      },
      knowledge: {
        async listKnowledge() {
          return [];
        },
      },
      conversations: {
        async findConversation() {
          return null;
        },
        async listMessages() {
          return [];
        },
      },
      cashFlow: {
        async getMonthlyCashFlow() {
          return {
            tenantId: 'tenant-a',
            today: new Date('2026-09-29T00:00:00.000Z'),
            monthKey: '2026-09',
            from: new Date('2026-09-01T00:00:00.000Z'),
            to: new Date('2026-09-30T00:00:00.000Z'),
            costCenterCashSplit: true,
            realized: {
              inflows: new Prisma.Decimal('0'),
              outflows: new Prisma.Decimal('0'),
              result: new Prisma.Decimal('0'),
            },
            realizedByCategory: { inflows: null, outflows: null },
            expected: {
              receivables: new Prisma.Decimal('0'),
              payables: new Prisma.Decimal('0'),
              result: new Prisma.Decimal('0'),
            },
            overdue: {
              receivables: new Prisma.Decimal('0'),
              payables: new Prisma.Decimal('0'),
              ofMonth: { receivables: new Prisma.Decimal('0'), payables: new Prisma.Decimal('0') },
            },
            stock: {
              receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
              payables: { open: null, overdue: null, dueToday: null, upcoming: null },
            },
            coverage: null,
            daily: { realized: [], expected: [] },
          } satisfies MonthlyCashFlow;
        },
      },
      analytics: {
        async getFinancialStockSnapshot() {
          return {
            tenantId: 'tenant-a',
            today: new Date('2026-09-29T00:00:00.000Z'),
            receivables: {
              open: new Prisma.Decimal('0'),
              overdue: new Prisma.Decimal('0'),
              upcoming: new Prisma.Decimal('0'),
            },
            payables: {
              open: new Prisma.Decimal('0'),
              overdue: new Prisma.Decimal('0'),
              upcoming: new Prisma.Decimal('0'),
            },
            receivableDelinquency: {
              overdueUnpaid: new Prisma.Decimal('0'),
              openUnpaid: new Prisma.Decimal('0'),
              rate: null,
            },
          } satisfies FinancialStockSnapshot;
        },
      },
    };

    const built = await createBuildAdvisorContext(deps).build({
      tenantId: 'tenant-a',
      question: 'Como devo avaliar minha reserva de caixa?',
      monthKey: '2026-09',
    });
    const platform = built.blocks.find((block) => block.type === 'PLATFORM_INSTRUCTIONS');
    expect(platform?.content).toContain('APRESENTAÇÃO DE FÓRMULAS:');
    expect(platform?.content).toContain('Não use LaTeX');
    expect(platform?.content).toBe(ADVISOR_PLATFORM_INSTRUCTIONS);
  });
});

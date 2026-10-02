import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { proactiveTitleSubjectKey } from '../src/modules/advisor/domain/evaluate-proactive-triggers.js';
import { createUserRepository } from '../src/modules/auth/repositories/user.repository.js';
import { createAdvisorConversationRepository } from '../src/modules/advisor/repositories/advisor-conversation.repository.js';
import { createProactiveInsightRepository } from '../src/modules/advisor/repositories/proactive-insight.repository.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createProactiveInsightDelivery } from '../src/modules/advisor/services/proactive-insight-delivery.service.js';
import { createProactiveTriggerService } from '../src/modules/advisor/services/proactive-trigger.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const triggers = createProactiveTriggerRepository(prisma);
const triggerService = createProactiveTriggerService(triggers);
const insights = createProactiveInsightRepository(prisma);
const conversations = createAdvisorConversationRepository(prisma);
const delivery = createProactiveInsightDelivery({ insights, conversations, reads: triggers });
const actor = { role: 'ADMIN' as const, supportSession: false };
const NOW = new Date('2026-10-01T15:00:00.000Z');

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedTitle(input: {
  readonly tenantId: string;
  readonly configurationId: string;
  readonly kind: 'PAYABLE' | 'RECEIVABLE';
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly content: string;
}) {
  const subjectKey = proactiveTitleSubjectKey(input.kind, input.externalId);
  const recorded = await triggers.recordOccurrence({
    tenantId: input.tenantId,
    configurationId: input.configurationId,
    periodKey: input.dueDate,
    subjectKey: subjectKey ?? '',
    periodStart: new Date(`${input.dueDate}T00:00:00.000Z`),
    periodEnd: new Date(`${input.dueDate}T00:00:00.000Z`),
    sourceMetric: 'installment.due_soon',
    detectedAt: NOW,
    severity: 'ATTENTION',
    payload: {
      titleKind: input.kind,
      externalId: input.externalId,
      dueDate: input.dueDate,
      unpaid: input.unpaid,
      minimumAmount: '5000.0000',
      daysAhead: 3,
      status: 'OPEN',
    },
  });
  await insights.saveNarration(input.tenantId, recorded.insightId, {
    title: 'Vencimento',
    content: input.content,
  });
  return recorded.insightId;
}

describe('consolidação de TITLE_DUE_SOON na apresentação', () => {
  it('mostra um título sozinho e agrupa pagáveis e recebíveis sem fundir os fatos', async () => {
    const tenant = await tenants.create({ name: 'titulos', displayName: 'Titulos' });
    const other = await tenants.create({ name: 'outro', displayName: 'Outro' });
    const userA = await users.create({
      name: 'A',
      email: 'a@titulos.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });
    const userB = await users.create({
      name: 'B',
      email: 'b@titulos.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });
    const outsider = await users.create({
      name: 'C',
      email: 'c@outro.test',
      role: 'USER',
      tenantId: other.id,
      status: 'ACTIVE',
    });
    const operator = await users.create({
      name: 'Ops',
      email: 'ops@titulos.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const payable = await triggerService.createConfiguration(actor, tenant.id, 'TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    });
    const receivable = await triggerService.createConfiguration(actor, tenant.id, 'TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'RECEIVABLE',
    });

    const alone = await seedTitle({
      tenantId: tenant.id,
      configurationId: payable.id,
      kind: 'PAYABLE',
      externalId: 'alone',
      dueDate: '2026-10-02',
      unpaid: '800.00',
      content: 'Há uma conta a pagar de R$ 800,00.',
    });
    const aloneView = await delivery.present({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(aloneView.materialized).toBe(1);
    expect(aloneView.messages[0]?.content).toBe('Há uma conta a pagar de R$ 800,00.');
    expect(aloneView.messages[0]?.relatedInsightId).toBe(alone);
    await delivery.present({ tenantId: tenant.id, userId: userB.id, actor: 'tenant-member', now: NOW });
    expect(await prisma.aiInsight.count({ where: { tenantId: tenant.id } })).toBe(1);

    const payables = [
      await seedTitle({
        tenantId: tenant.id,
        configurationId: payable.id,
        kind: 'PAYABLE',
        externalId: 'p1',
        dueDate: '2026-10-03',
        unpaid: '250.00',
        content: 'Prezado(a), pagamento de R$ 250,00.',
      }),
      await seedTitle({
        tenantId: tenant.id,
        configurationId: payable.id,
        kind: 'PAYABLE',
        externalId: 'p2',
        dueDate: '2026-10-04',
        unpaid: '1550.24',
        content: 'Prezado(a), pagamento de R$ 1.550,24.',
      }),
      await seedTitle({
        tenantId: tenant.id,
        configurationId: payable.id,
        kind: 'PAYABLE',
        externalId: 'p3',
        dueDate: '2026-10-05',
        unpaid: '2150.20',
        content: 'Prezado(a), pagamento de R$ 2.150,20.',
      }),
    ];
    const receivables = [
      await seedTitle({
        tenantId: tenant.id,
        configurationId: receivable.id,
        kind: 'RECEIVABLE',
        externalId: 'r1',
        dueDate: '2026-10-03',
        unpaid: '100.00',
        content: 'Cobrança ao cliente de R$ 100,00.',
      }),
      await seedTitle({
        tenantId: tenant.id,
        configurationId: receivable.id,
        kind: 'RECEIVABLE',
        externalId: 'r2',
        dueDate: '2026-10-04',
        unpaid: '40.00',
        content: 'Cobrança ao cliente de R$ 40,00.',
      }),
      await seedTitle({
        tenantId: tenant.id,
        configurationId: receivable.id,
        kind: 'RECEIVABLE',
        externalId: 'r3',
        dueDate: '2026-10-06',
        unpaid: '10.50',
        content: 'Cobrança ao cliente de R$ 10,50.',
      }),
    ];

    const stored = await insights.findByTenant(tenant.id, payables[0]!);
    expect(stored?.content).toContain('Prezado(a)');

    const presented = await delivery.present({
      tenantId: tenant.id,
      userId: userB.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(presented.materialized).toBe(2);
    const payableText = presented.messages.find((message) => message.content.includes('contas a pagar'));
    const receivableText = presented.messages.find((message) =>
      message.content.includes('contas a receber'),
    );
    expect(payableText?.content).toContain('Identifiquei **3 contas a pagar**');
    expect(payableText?.content).toContain('- **03/10** — R$ 250,00');
    expect(payableText?.content).toContain('- **04/10** — R$ 1.550,24');
    expect(payableText?.content).toContain('- **05/10** — R$ 2.150,20');
    expect(payableText?.content).toContain('**Total: R$ 3.950,44**');
    expect(payableText?.content).not.toContain('Prezado');
    expect(payableText?.content).not.toContain('800,00');
    expect(receivableText?.content).toContain('Identifiquei **3 contas a receber**');
    expect(receivableText?.content).toContain('**Total: R$ 150,50**');

    const links = await prisma.aiMessageInsightLink.findMany({
      where: { tenantId: tenant.id, messageId: payableText?.id },
    });
    expect(links.map((link) => link.insightId).sort()).toEqual([...payables].sort());
    const official = await insights.listPresentedFacts(tenant.id, [payableText!.id]);
    expect(official).toHaveLength(3);
    expect(official.every((item) => item.messageId === payableText?.id)).toBe(true);
    const fresh = await conversations.createConversation(
      tenant.id,
      userB.id,
      { title: null },
      'tenant-member',
    );
    expect(await insights.listPresentedFacts(tenant.id, [])).toEqual([]);
    expect(await prisma.aiMessage.count({ where: { conversationId: fresh.id } })).toBe(0);
    expect(await prisma.aiConversation.count({ where: { tenantId: tenant.id, userId: userB.id } })).toBe(2);
    expect(
      await prisma.aiMessage.count({
        where: { tenantId: tenant.id, conversationId: { not: fresh.id }, content: { contains: '3 contas a pagar' } },
      }),
    ).toBeGreaterThan(0);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenant.id } })).toBe(7);
    expect((await insights.findByTenant(tenant.id, payables[1]!))?.content).toContain('Prezado(a)');

    const again = await delivery.present({
      tenantId: tenant.id,
      userId: userB.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(again.materialized).toBe(0);
    expect(await prisma.aiMessage.count({ where: { tenantId: tenant.id, conversation: { userId: userB.id } } })).toBe(
      3,
    );
    expect(await prisma.aiInsightRead.count({ where: { tenantId: tenant.id, userId: userB.id } })).toBe(7);
    expect(await prisma.aiInsightRead.count({ where: { tenantId: tenant.id, userId: userA.id } })).toBe(1);
    expect(await delivery.unreadCount({ tenantId: tenant.id, userId: userA.id, actor: 'tenant-member' })).toBe(6);

    const forA = await delivery.present({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(forA.materialized).toBe(2);
    expect(await prisma.aiInsightRead.count({ where: { tenantId: tenant.id, userId: userA.id } })).toBe(7);
    expect(await delivery.unreadCount({ tenantId: other.id, userId: outsider.id, actor: 'tenant-member' })).toBe(0);
    expect(await prisma.aiMessageInsightLink.count({ where: { insightId: { in: receivables } } })).toBe(
      receivables.length * 2,
    );

    const support = await delivery.present({
      tenantId: tenant.id,
      userId: operator.id,
      actor: 'support-operator',
      now: NOW,
    });
    expect(support.materialized).toBe(2);
    expect(await prisma.aiInsightRead.count({ where: { userId: operator.id } })).toBe(0);
    expect(await delivery.unreadCount({ tenantId: tenant.id, userId: userA.id, actor: 'tenant-member' })).toBe(0);
    const supportAgain = await delivery.present({
      tenantId: tenant.id,
      userId: operator.id,
      actor: 'support-operator',
      now: NOW,
    });
    expect(supportAgain.materialized).toBe(0);
  });
});

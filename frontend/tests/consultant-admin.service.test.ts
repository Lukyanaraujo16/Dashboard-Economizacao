import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminConsultantOptionsPath,
  adminTenantConsultantKnowledgeEntryPath,
  adminTenantConsultantKnowledgePath,
  adminTenantConsultantPath,
} from '../src/lib/api-config';
import {
  createTenantConsultantKnowledge,
  defaultModelForProvider,
  deleteTenantConsultantKnowledge,
  getConsultantOptions,
  getTenantConsultant,
  isValidProviderModel,
  listTenantConsultantKnowledge,
  updateTenantConsultant,
  updateTenantConsultantKnowledge,
} from '../src/services/admin/consultant';
import type {
  ConsultantKnowledgeEntry,
  ConsultantOptions,
  ConsultantSettings,
} from '../src/services/admin/consultant.types';

const tenantId = '11111111-1111-4111-8111-111111111111';

const options: ConsultantOptions = {
  providers: [
    {
      id: 'OPENAI',
      label: 'OpenAI',
      models: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }],
    },
    {
      id: 'ANTHROPIC',
      label: 'Anthropic',
      models: [
        { id: 'claude-sonnet-5', label: 'claude-sonnet-5' },
        { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
      ],
    },
  ],
  tonePresets: [
    { id: 'PROFISSIONAL_OBJETIVO', label: 'Profissional e objetivo' },
    { id: 'PERSONALIZADO', label: 'Personalizado' },
  ],
};

const settings: ConsultantSettings = {
  configured: true,
  status: 'ACTIVE',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  consultantName: 'Clara',
  businessSegment: 'Varejo',
  businessDescription: 'Loja de bairro',
  adminPrompt: 'Seja objetivo',
  tonePreset: 'PROFISSIONAL_OBJETIVO',
  tone: 'formal',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const knowledge: ConsultantKnowledgeEntry = {
  id: 'k-1',
  title: 'Política de crédito',
  content: 'Prazo padrão de 30 dias.',
  contentType: 'TEXT',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin consultant service', () => {
  it('getConsultantOptions usa credentials include', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(options)));

    await getConsultantOptions();

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminConsultantOptionsPath());
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('GET');
  });

  it('get/update settings usam same-origin e PUT', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(jsonResponse({ ...settings, tone: 'direto' }));
    vi.stubGlobal('fetch', fetchMock);

    await getTenantConsultant(tenantId);
    await updateTenantConsultant(tenantId, {
      status: 'DISABLED',
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5',
      consultantName: 'Clara',
      businessSegment: null,
      businessDescription: null,
      adminPrompt: null,
      tonePreset: 'PERSONALIZADO',
      tone: 'direto',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(adminTenantConsultantPath(tenantId));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(adminTenantConsultantPath(tenantId));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('include');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      status: 'DISABLED',
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5',
      consultantName: 'Clara',
      businessSegment: null,
      businessDescription: null,
      adminPrompt: null,
      tonePreset: 'PERSONALIZADO',
      tone: 'direto',
    });
  });

  it('knowledge CRUD usa credentials include', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [knowledge] }))
      .mockResolvedValueOnce(jsonResponse(knowledge, 201))
      .mockResolvedValueOnce(jsonResponse({ ...knowledge, title: 'Atualizado' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await listTenantConsultantKnowledge(tenantId);
    await createTenantConsultantKnowledge(tenantId, {
      title: 'Política de crédito',
      content: 'Prazo padrão de 30 dias.',
    });
    await updateTenantConsultantKnowledge(tenantId, knowledge.id, { title: 'Atualizado' });
    await deleteTenantConsultantKnowledge(tenantId, knowledge.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(adminTenantConsultantKnowledgePath(tenantId));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(adminTenantConsultantKnowledgePath(tenantId));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      adminTenantConsultantKnowledgeEntryPath(tenantId, knowledge.id),
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PUT');
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('DELETE');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('include');
    }
  });

  it('aceita lista de knowledge como array nu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([knowledge])));
    await expect(listTenantConsultantKnowledge(tenantId)).resolves.toEqual([knowledge]);
  });

  it('422 mapeia envelope de validação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos.',
              details: [{ field: 'model', issue: 'not_allowed' }],
            },
          },
          422,
        ),
      ),
    );

    await expect(
      updateTenantConsultant(tenantId, {
        status: 'ACTIVE',
        provider: 'OPENAI',
        model: 'invalido',
        consultantName: null,
        businessSegment: null,
        businessDescription: null,
        adminPrompt: null,
        tonePreset: 'PROFISSIONAL_OBJETIVO',
        tone: null,
      }),
    ).rejects.toMatchObject({ kind: 'validation' });
  });

  it('default do catálogo valida combinação provider/model', () => {
    expect(defaultModelForProvider(options, 'OPENAI')).toBe('gpt-4o-mini');
    expect(defaultModelForProvider(options, 'ANTHROPIC')).toBe('claude-sonnet-5');
    expect(isValidProviderModel(options, 'OPENAI', 'claude-sonnet-5')).toBe(false);
    expect(isValidProviderModel(options, 'ANTHROPIC', 'claude-sonnet-5')).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminOperationsAiRunsPath,
  adminOperationsAuditLogsPath,
} from '../src/lib/api-config';
import { listOperationAiRuns, listOperationAuditLogs } from '../src/services/admin/operations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('leitura administrativa de operação', () => {
  it('descarta prompt e segredo ao ler AiRun', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              tenantId: '22222222-2222-4222-8222-222222222222',
              tenantDisplayName: 'Empresa A',
              userId: '33333333-3333-4333-8333-333333333333',
              userName: 'Ana',
              runType: 'QUESTION_REPLY',
              provider: 'OPENAI',
              model: 'gpt-test',
              status: 'SUCCEEDED',
              inputTokens: 3,
              outputTokens: 4,
              durationMs: 10,
              errorCode: null,
              createdAt: '2026-08-03T12:00:00.000Z',
              finishedAt: null,
              prompt: 'PROMPT_COMPLETO_SIGILOSO',
              content: 'resposta privada',
              apiKey: 'sk-live-secret-key',
            },
          ],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listOperationAiRuns({ limit: 20, offset: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${adminOperationsAiRunsPath()}?limit=20&offset=0`,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(result.data[0]).toMatchObject({
      provider: 'OPENAI',
      model: 'gpt-test',
      status: 'SUCCEEDED',
      userName: 'Ana',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('PROMPT_COMPLETO_SIGILOSO');
    expect(serialized).not.toContain('sk-live-secret-key');
    expect(serialized).not.toContain('resposta privada');
  });

  it('descarta senha e token ao ler auditoria', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                operatorUserId: '33333333-3333-4333-8333-333333333333',
                operatorName: 'Admin',
                tenantId: '22222222-2222-4222-8222-222222222222',
                tenantDisplayName: 'Empresa A',
                action: 'tenant_user.password_reset',
                targetType: 'user',
                targetId: '44444444-4444-4444-8444-444444444444',
                result: 'SUCCESS',
                createdAt: '2026-08-03T12:00:00.000Z',
                metadata: {
                  fields: ['name'],
                  password: 'Segredo#Auditoria99',
                  token: 'sess-token',
                },
              },
            ],
            pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await listOperationAuditLogs({
      limit: 20,
      offset: 0,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'tenant_user.password_reset',
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      `${adminOperationsAuditLogsPath()}?limit=20&offset=0&tenantId=22222222-2222-4222-8222-222222222222&action=tenant_user.password_reset`,
    );
    expect(result.data[0]?.metadata).toEqual({ fields: ['name'] });
    expect(JSON.stringify(result)).not.toContain('Segredo#Auditoria99');
    expect(JSON.stringify(result)).not.toContain('sess-token');
  });
});

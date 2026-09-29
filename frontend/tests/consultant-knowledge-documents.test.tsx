import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyConsultantPage } from '../src/components/companies/company-consultant-page';
import {
  formatKnowledgeDocumentSize,
  knowledgeDocumentProcessingErrorMessage,
  knowledgeDocumentProcessingLabel,
  suggestKnowledgeDocumentTitle,
} from '../src/services/admin/consultant';
import type {
  ConsultantKnowledgeDocument,
  ConsultantKnowledgeEntry,
  ConsultantOptions,
  ConsultantProviderStatus,
  ConsultantSettings,
} from '../src/services/admin/consultant.types';
import { CONSULTANT_KNOWLEDGE_DOCUMENT_MAX_BYTES } from '../src/services/admin/consultant.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const options: ConsultantOptions = {
  providers: [
    {
      id: 'OPENAI',
      label: 'OpenAI',
      models: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }],
    },
  ],
  tonePresets: [{ id: 'PROFISSIONAL_OBJETIVO', label: 'Profissional e objetivo' }],
  emojiPreferences: [{ id: 'MODERATE', label: 'Usar com moderação' }],
};

const configured: ConsultantSettings = {
  configured: true,
  status: 'ACTIVE',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  consultantName: 'Lia',
  businessSegment: 'Clinica',
  businessDescription: 'Atendimento',
  adminPrompt: 'Seja objetiva',
  tonePreset: 'PROFISSIONAL_OBJETIVO',
  tone: null,
  emojiPreference: 'MODERATE',
  updatedAt: '2026-09-29T10:00:00.000Z',
};

const providers: readonly ConsultantProviderStatus[] = [
  {
    provider: 'OPENAI',
    configured: true,
    source: 'MANAGED',
    displayHint: 'sk-••••',
    configuredAt: '2026-09-29T10:00:00.000Z',
  },
];

const readyDoc: ConsultantKnowledgeDocument = {
  id: 'doc-ready',
  title: 'Base conhecimento',
  originalFileName: 'base-conhecimento.md',
  mimeType: 'text/markdown',
  sizeBytes: 2048,
  status: 'DISABLED',
  processingStatus: 'READY',
  chunkCount: 4,
  extractedCharCount: 600,
  processingErrorCode: null,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  processedAt: '2026-09-29T10:00:00.000Z',
};

const failedDoc: ConsultantKnowledgeDocument = {
  ...readyDoc,
  id: 'doc-failed',
  title: 'PDF sem texto',
  originalFileName: 'scan.pdf',
  mimeType: 'application/pdf',
  processingStatus: 'FAILED',
  chunkCount: 0,
  extractedCharCount: 0,
  processingErrorCode: 'KNOWLEDGE_DOCUMENT_PDF_NO_TEXT',
  processedAt: '2026-09-29T10:01:00.000Z',
};

const longNameDoc: ConsultantKnowledgeDocument = {
  ...readyDoc,
  id: 'doc-long',
  title: 'Documento com título longo para layout',
  originalFileName:
    'base-conhecimento-consultor-empresarial-com-foco-em-caixa-e-operacoes-financeiras-muito-longo.md',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => `/empresas/${companyId}/consultor`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mockFetch(input: {
  readonly documents?: ConsultantKnowledgeDocument[];
  readonly uploadResult?: ConsultantKnowledgeDocument;
  readonly forbidUpload?: boolean;
}) {
  let documents = [...(input.documents ?? [])];
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith(`/admin/tenants/${companyId}`) && !url.includes('/consultant')) {
      return jsonResponse({
        id: companyId,
        name: 'alpha-co',
        displayName: 'Alpha Co',
        status: 'ACTIVE',
        createdAt: '2026-08-14T10:00:00.000Z',
        updatedAt: '2026-08-14T11:00:00.000Z',
        deactivatedAt: null,
        integration: null,
      });
    }
    if (url.endsWith('/admin/consultant/options')) {
      return jsonResponse(options);
    }
    if (url.endsWith('/admin/consultant/providers')) {
      return jsonResponse({ data: providers });
    }
    if (url.includes('/consultant/knowledge-documents')) {
      if (init?.method === 'POST') {
        if (input.forbidUpload) {
          return jsonResponse({ error: { code: 'FORBIDDEN', message: 'forbidden' } }, 403);
        }
        const created = input.uploadResult ?? {
          ...readyDoc,
          id: 'doc-uploaded',
          title: 'Arquivo enviado',
        };
        documents = [created, ...documents];
        return jsonResponse(created, 201);
      }
      if (url.match(/knowledge-documents\/[^/]+$/) && init?.method === 'DELETE') {
        const id = url.split('/').pop() ?? '';
        documents = documents.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }
      if (url.match(/knowledge-documents\/[^/]+$/) && init?.method === 'PATCH') {
        const id = url.split('/').pop() ?? '';
        const payload = JSON.parse(String(init.body)) as Partial<ConsultantKnowledgeDocument>;
        const current = documents.find((item) => item.id === id);
        if (!current) {
          return jsonResponse({ error: { code: 'NOT_FOUND', message: 'missing' } }, 404);
        }
        if (payload.status === 'ACTIVE' && current.processingStatus !== 'READY') {
          return jsonResponse(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Somente documentos prontos podem ser ativados.',
              },
            },
            422,
          );
        }
        const updated = { ...current, ...payload };
        documents = documents.map((item) => (item.id === updated.id ? updated : item));
        return jsonResponse(updated);
      }
      return jsonResponse({ data: documents });
    }
    if (url.includes('/consultant/knowledge')) {
      return jsonResponse({ data: [] as ConsultantKnowledgeEntry[] });
    }
    if (url.includes('/consultant')) {
      return jsonResponse(configured);
    }
    return jsonResponse({}, 404);
  });
}

async function openKnowledgeStep() {
  renderWithAuth(
    <ThemeProvider>
      <CompanyConsultantPage companyId={companyId} />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'ADMIN',
        tenantId: null,
      }),
      hydrateOnMount: true,
    },
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar conhecimentos' }));
  expect(await screen.findByTestId('consultant-knowledge-documents')).toBeTruthy();
}

describe('helpers documentais F13.8.2B', () => {
  it('sugere título e formata tamanho/status/erro', () => {
    expect(suggestKnowledgeDocumentTitle('base-conhecimento-consultor.md')).toBe(
      'Base conhecimento consultor',
    );
    expect(formatKnowledgeDocumentSize(512)).toBe('512 B');
    expect(formatKnowledgeDocumentSize(2048)).toBe('2.0 KB');
    expect(formatKnowledgeDocumentSize(CONSULTANT_KNOWLEDGE_DOCUMENT_MAX_BYTES)).toBe('5.0 MB');
    expect(knowledgeDocumentProcessingLabel('READY')).toBe('Pronto');
    expect(knowledgeDocumentProcessingLabel('FAILED')).toBe('Falhou');
    expect(knowledgeDocumentProcessingErrorMessage('KNOWLEDGE_DOCUMENT_PDF_NO_TEXT')).toContain(
      'texto selecionável',
    );
    expect(knowledgeDocumentProcessingErrorMessage('UNKNOWN_CODE')).toBe(
      'Não foi possível processar este arquivo.',
    );
  });
});

describe('UI arquivos da Base de Conhecimento (F13.8.2B)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mostra empty state e botão enviar arquivo', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [] }));
    await openKnowledgeStep();
    expect(screen.getByTestId('knowledge-documents-empty')).toBeTruthy();
    expect(screen.getByText(/Markdown \(\.md\) e PDF textual/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Enviar arquivo' }).length).toBeGreaterThan(0);
  });

  it('lista READY/FAILED, bloqueia ativar FAILED e permite ativar READY', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [readyDoc, failedDoc] }));
    await openKnowledgeStep();

    expect(screen.getByTestId('knowledge-document-doc-ready')).toBeTruthy();
    expect(screen.getByText('Pronto')).toBeTruthy();
    expect(screen.getByText('Falhou')).toBeTruthy();
    expect(
      screen.getByText(/Não encontramos texto neste PDF/),
    ).toBeTruthy();

    const failedCard = screen.getByTestId('knowledge-document-doc-failed');
    const activateFailed = Array.from(failedCard.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Ativar',
    ) as HTMLButtonElement;
    expect(activateFailed.disabled).toBe(true);

    const readyCard = screen.getByTestId('knowledge-document-doc-ready');
    const activateReady = Array.from(readyCard.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Ativar',
    ) as HTMLButtonElement;
    expect(activateReady.disabled).toBe(false);
    fireEvent.click(activateReady);
    await waitFor(() => {
      expect(screen.getByText('Arquivo ativado.')).toBeTruthy();
    });
  });

  it('valida extensão e tamanho antes do upload', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [] }));
    await openKnowledgeStep();
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar arquivo' })[0]!);

    const form = screen.getByTestId('consultant-knowledge-document-form');
    const fileInput = within(form).getByLabelText('Arquivo') as HTMLInputElement;
    const bad = new File(['x'], 'malware.exe', { type: 'application/octet-stream' });
    fireEvent.change(fileInput, { target: { files: [bad] } });
    fireEvent.click(within(form).getByTestId('knowledge-documents-submit'));
    expect(await screen.findByText(/Formato não suportado/)).toBeTruthy();

    const huge = new File([new Uint8Array(CONSULTANT_KNOWLEDGE_DOCUMENT_MAX_BYTES + 1)], 'huge.md', {
      type: 'text/markdown',
    });
    fireEvent.change(fileInput, { target: { files: [huge] } });
    fireEvent.click(within(form).getByTestId('knowledge-documents-submit'));
    expect(await screen.findByText(/excede o tamanho máximo de 5 MB/)).toBeTruthy();
  });

  it('faz upload MD com sucesso e exibe READY', async () => {
    const fetchMock = mockFetch({
      documents: [],
      uploadResult: { ...readyDoc, id: 'doc-new', title: 'Guia enviado' },
    });
    vi.stubGlobal('fetch', fetchMock);
    await openKnowledgeStep();
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar arquivo' })[0]!);

    const form = screen.getByTestId('consultant-knowledge-document-form');
    const fileInput = within(form).getByLabelText('Arquivo') as HTMLInputElement;
    const md = new File(['# Guia\n'], 'guia-enviado.md', { type: 'text/markdown' });
    fireEvent.change(fileInput, { target: { files: [md] } });
    expect((within(form).getByLabelText('Título') as HTMLInputElement).value.length).toBeGreaterThan(
      0,
    );

    fireEvent.click(within(form).getByTestId('knowledge-documents-submit'));
    await waitFor(() => {
      expect(screen.getByText('Arquivo enviado e pronto.')).toBeTruthy();
      expect(screen.getByTestId('knowledge-document-doc-new')).toBeTruthy();
    });
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).includes('/knowledge-documents') &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('confirma exclusão e remove da lista', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [readyDoc] }));
    await openKnowledgeStep();
    const card = screen.getByTestId('knowledge-document-doc-ready');
    fireEvent.click(
      Array.from(card.querySelectorAll('button')).find((btn) => btn.textContent === 'Excluir')!,
    );
    expect(screen.getByText('Excluir este arquivo da Base de Conhecimento?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-document-doc-ready')).toBeNull();
      expect(screen.getByText('Arquivo excluído.')).toBeTruthy();
    });
  });

  it('trata 403 de upload sem vazar detalhe técnico', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [], forbidUpload: true }));
    await openKnowledgeStep();
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar arquivo' })[0]!);
    const form = screen.getByTestId('consultant-knowledge-document-form');
    const fileInput = within(form).getByLabelText('Arquivo') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['# x'], 'ok.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(within(form).getByTestId('knowledge-documents-submit'));
    expect(await screen.findByText('Você não tem permissão para esta operação.')).toBeTruthy();
  });

  it('não quebra layout com nome de arquivo longo', async () => {
    vi.stubGlobal('fetch', mockFetch({ documents: [longNameDoc] }));
    await openKnowledgeStep();
    const card = screen.getByTestId('knowledge-document-doc-long');
    expect(card.textContent).toContain('muito-longo.md');
    expect(card.textContent).toContain('Documento com título longo para layout');
  });
});

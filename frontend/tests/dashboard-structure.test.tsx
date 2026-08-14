import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardCard,
  DashboardGrid,
  DashboardHero,
  DashboardPage,
  DashboardSection,
  EmptyPanel,
  EmptyState,
  resolveGreetingPrefix,
} from '../src/components/dashboard';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

function renderDashboard() {
  return renderWithAuth(
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
      hydrateOnMount: true,
    },
  );
}

describe('Dashboard structure (1.2A)', () => {
  it('resolveGreetingPrefix cobre manhã, tarde e noite', () => {
    expect(resolveGreetingPrefix(new Date('2026-08-13T08:00:00'))).toBe('Bom dia');
    expect(resolveGreetingPrefix(new Date('2026-08-13T15:00:00'))).toBe('Boa tarde');
    expect(resolveGreetingPrefix(new Date('2026-08-13T21:00:00'))).toBe('Boa noite');
  });

  it('renderiza estrutura principal em empty state', async () => {
    renderDashboard();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /(bom dia|boa tarde|boa noite), usuário teste/i,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Resumo Financeiro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fluxo de Caixa' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Movimentações Recentes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Alertas' })).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Receita' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Saldo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeTruthy();

    expect(screen.getAllByText('Disponível após sincronização.').length).toBe(4);
    expect(screen.getByText('Nenhuma movimentação disponível.')).toBeTruthy();
    expect(screen.getByText('Nenhum alerta disponível.')).toBeTruthy();
    expect(document.querySelector('[data-dashboard-page="true"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-kpi-empty="true"]').length).toBe(4);
    expect(document.querySelector('[data-panel-icon="chart"]')).toBeTruthy();
    expect(document.querySelector('[data-panel-icon="list"]')).toBeTruthy();
    expect(document.querySelector('[data-panel-icon="alert"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-grid="true"]')).toBeTruthy();
  });

  it('não apresenta valores financeiros fictícios', async () => {
    renderDashboard();

    await screen.findByRole('heading', { name: 'Resumo Financeiro' });
    expect(screen.queryByText(/R\$\s*\d/)).toBeNull();
    expect(screen.queryByText(/\d+([.,]\d+)?\s*%/)).toBeNull();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });

  it('EmptyState e EmptyPanel renderizam descrição', () => {
    render(
      <ThemeProvider>
        <EmptyState description="Estado vazio de teste." />
        <EmptyPanel description="Painel vazio de teste." />
        <DashboardSection id="sec-test" title="Seção teste">
          <DashboardGrid columns={2}>
            <DashboardCard title="Card A" />
            <DashboardCard title="Card B" emptyDescription="Sem dado." />
          </DashboardGrid>
        </DashboardSection>
        <DashboardHero displayName="Ana" now={new Date('2026-08-13T09:00:00')} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Estado vazio de teste.')).toBeTruthy();
    expect(screen.getByText('Painel vazio de teste.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Seção teste' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bom dia, Ana.' })).toBeTruthy();
    expect(screen.getByText('Sem dado.')).toBeTruthy();
  });
});

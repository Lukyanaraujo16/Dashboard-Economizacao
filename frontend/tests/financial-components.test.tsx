import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChartCard,
  FinancialGrid,
  FinancialSection,
  KpiCard,
  StateWrapper,
} from '../src/components/financial';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Financial components (1.2B)', () => {
  describe('StateWrapper', () => {
    it('renderiza children em ready', () => {
      renderWithTheme(
        <StateWrapper state="ready">
          <p>Conteúdo pronto</p>
        </StateWrapper>,
      );
      expect(screen.getByText('Conteúdo pronto')).toBeTruthy();
      expect(document.querySelector('[data-state-wrapper]')).toBeNull();
    });

    it('exibe loading com spinner acessível', () => {
      renderWithTheme(<StateWrapper state="loading" loadingLabel="Carregando KPI" />);
      expect(document.querySelector('[data-state-wrapper="loading"]')).toBeTruthy();
      expect(screen.getByRole('status', { name: 'Carregando KPI' })).toBeTruthy();
    });

    it('exibe empty com mensagem', () => {
      renderWithTheme(<StateWrapper state="empty" emptyMessage="Sem registros." />);
      expect(screen.getByText('Sem registros.')).toBeTruthy();
    });

    it('exibe error e dispara retry', () => {
      const onRetry = vi.fn();
      renderWithTheme(
        <StateWrapper state="error" errorMessage="Falha ao carregar." onRetry={onRetry} />,
      );
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Falha ao carregar.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('KpiCard', () => {
    it('empty: placeholder sem valor financeiro', () => {
      renderWithTheme(<KpiCard title="Receita" state="empty" />);
      expect(screen.getByRole('heading', { name: 'Receita' })).toBeTruthy();
      expect(document.querySelector('[data-kpi-empty="true"]')).toBeTruthy();
      expect(screen.getByText('Disponível após sincronização.')).toBeTruthy();
    });

    it('loading: spinner no card', () => {
      renderWithTheme(<KpiCard title="Saldo" state="loading" loadingLabel="Carregando saldo" />);
      expect(document.querySelector('[data-kpi-card][data-state="loading"]')).toBeTruthy();
      expect(screen.getByRole('status', { name: 'Carregando saldo' })).toBeTruthy();
    });

    it('ready: exibe value e meta via props', () => {
      renderWithTheme(
        <KpiCard title="Resultado" state="ready" value="Conteúdo KPI" meta="Período atual" />,
      );
      expect(document.querySelector('[data-kpi-ready="true"]')).toBeTruthy();
      expect(screen.getByText('Conteúdo KPI')).toBeTruthy();
      expect(screen.getByText('Período atual')).toBeTruthy();
    });

    it('error: mensagem e retry', () => {
      const onRetry = vi.fn();
      renderWithTheme(
        <KpiCard title="Despesas" state="error" errorMessage="Erro KPI." onRetry={onRetry} />,
      );
      expect(screen.getByText('Erro KPI.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('ChartCard', () => {
    it('empty: ícone e mensagem', () => {
      renderWithTheme(
        <ChartCard state="empty" size="chart" icon="chart" emptyMessage="Gráfico indisponível." />,
      );
      expect(document.querySelector('[data-chart-card][data-state="empty"]')).toBeTruthy();
      expect(document.querySelector('[data-panel-icon="chart"]')).toBeTruthy();
      expect(screen.getByText('Gráfico indisponível.')).toBeTruthy();
    });

    it('ready: renderiza slot de conteúdo', () => {
      renderWithTheme(
        <ChartCard state="ready" size="list">
          <div data-testid="chart-slot">Área reservada</div>
        </ChartCard>,
      );
      expect(screen.getByTestId('chart-slot')).toBeTruthy();
    });
  });

  describe('FinancialSection e FinancialGrid', () => {
    it('padroniza título, subtítulo e conteúdo', () => {
      renderWithTheme(
        <FinancialSection id="sec-a" title="Resumo" subtitle="Descrição curta.">
          <p>Conteúdo da seção</p>
        </FinancialSection>,
      );
      expect(screen.getByRole('heading', { name: 'Resumo' })).toBeTruthy();
      expect(screen.getByText('Descrição curta.')).toBeTruthy();
      expect(screen.getByText('Conteúdo da seção')).toBeTruthy();
      expect(document.querySelector('[data-financial-section="sec-a"]')).toBeTruthy();
    });

    it('grid responsivo aceita quantidade variável de filhos', () => {
      renderWithTheme(
        <FinancialGrid>
          <KpiCard title="A" state="empty" />
          <KpiCard title="B" state="empty" />
          <KpiCard title="C" state="empty" />
        </FinancialGrid>,
      );
      expect(document.querySelector('[data-financial-grid="true"]')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'A' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'B' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'C' })).toBeTruthy();
    });
  });
});

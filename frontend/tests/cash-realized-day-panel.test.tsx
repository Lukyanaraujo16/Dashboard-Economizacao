/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyRealizedCashChart } from '../src/components/dashboard/daily-realized-cash-chart';
import { getDashboardCashRealizedDayDetails } from '../src/services/dashboard/cash-realized-day-details';
import { DashboardCashRealizedDayDetailsRequestError } from '../src/services/dashboard/cash-realized-day-details.types';

vi.mock('../src/services/dashboard/cash-realized-day-details', () => ({
  getDashboardCashRealizedDayDetails: vi.fn(),
}));

const getDetails = vi.mocked(getDashboardCashRealizedDayDetails);

const daily = [
  { date: '2026-08-24', amount: '10.00' },
  { date: '2026-08-25', amount: '77.72' },
];
const accumulated = [
  { date: '2026-08-24', amount: '10.00' },
  { date: '2026-08-25', amount: '87.72' },
];

function mockWidth(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      width: 200,
      height: 40,
      left: 0,
      top: 0,
      right: 200,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

function renderChart(direction: 'inflows' | 'outflows' = 'inflows') {
  const onSelectDate = vi.fn();
  const view = render(
    <DailyRealizedCashChart
      dailyPoints={daily}
      accumulatedPoints={accumulated}
      colorVar="--color-series-revenue"
      dailyLabel={direction === 'inflows' ? 'Entradas por dia de baixa' : 'Pago por dia de baixa'}
      accumulatedLabel="Acumulado"
      dailyAriaLabel={direction === 'inflows' ? 'Faturamento diário' : 'Despesas diárias'}
      accumulatedAriaLabel="Acumulado do mês"
      dailyCaption="no dia"
      accumulatedCaption="acumulado"
      direction={direction}
      selectedDate={null}
      onSelectDate={onSelectDate}
      costCenterId="cc-1"
      categoryId="cat-1"
      chartClassName="chart"
      labelClassName="label"
    />,
  );
  return { ...view, onSelectDate };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('painel diário de caixa realizado', () => {
  it('o gráfico diário seleciona e o acumulado não abre detalhe', () => {
    const { onSelectDate } = renderChart();
    expect(screen.getByText('Selecione um dia para ver os lançamentos')).toBeTruthy();
    const dailyPlot = screen.getByRole('img', { name: /Faturamento diário/ });
    const accumulatedPlot = screen.getByRole('img', { name: 'Acumulado do mês' });
    mockWidth(dailyPlot);
    mockWidth(accumulatedPlot);
    fireEvent.click(accumulatedPlot, { clientX: 100, clientY: 10 });
    expect(onSelectDate).not.toHaveBeenCalled();
    fireEvent.click(dailyPlot, { clientX: 150, clientY: 10 });
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-25');
  });

  it('mostra loading, completo, parcial, vazio, indisponível e erro', async () => {
    let resolveReady: (value: Awaited<ReturnType<typeof getDashboardCashRealizedDayDetails>>) => void =
      () => undefined;
    getDetails.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        }),
    );
    const { rerender, onSelectDate } = renderChart('outflows');
    const plot = screen.getByRole('img', { name: /Despesas diárias/ });
    mockWidth(plot);
    fireEvent.click(plot, { clientX: 150, clientY: 10 });
    const selected = onSelectDate.mock.calls[0]?.[0] as string;
    rerender(
      <DailyRealizedCashChart
        dailyPoints={daily}
        accumulatedPoints={accumulated}
        colorVar="--color-series-expense"
        dailyLabel="Pago por dia de baixa"
        accumulatedLabel="Acumulado"
        dailyAriaLabel="Despesas diárias"
        accumulatedAriaLabel="Acumulado do mês"
        dailyCaption="pago no dia"
        accumulatedCaption="acumulado"
        direction="outflows"
        selectedDate={selected}
        onSelectDate={onSelectDate}
        costCenterId="cc-1"
        categoryId="cat-1"
        chartClassName="chart"
        labelClassName="label"
      />,
    );
    expect(screen.getByText('Carregando lançamentos…')).toBeTruthy();
    expect(screen.getByText('Pagamentos')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /Despesas diárias/ }).querySelector('[data-sparkline-selected="true"]'),
    ).toBeTruthy();
    expect(getDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        date: selected,
        direction: 'outflows',
        costCenterId: 'cc-1',
        categoryId: 'cat-1',
      }),
    );

    resolveReady({
      date: selected,
      direction: 'outflows',
      completeness: 'COMPLETE',
      total: '77.72',
      returnedSum: '77.72',
      difference: '0',
      hasMore: false,
      itemCount: 1,
      limit: 40,
      items: [
        {
          occurredOn: selected,
          attributedAmount: '77.72',
          partyName: 'Empresa A',
          description: 'Atendimentos',
          displayLabel: 'Empresa A',
          categoryNames: ['Convênio'],
          costCenterLabel: 'Laranjeiras',
        },
      ],
    });
    const completeTotal = await screen.findByText(
      (_, node) => node?.getAttribute('data-cash-day-total') === 'true',
    );
    expect(completeTotal.textContent).toMatch(/77,72/);
    expect(screen.getByText('1 pagamento')).toBeTruthy();
    expect(screen.getByText('Empresa A')).toBeTruthy();
    expect(screen.getByText(/Convênio/)).toBeTruthy();
    expect(screen.getByText(/Laranjeiras/)).toBeTruthy();
    expect(screen.queryByText(/Exibindo parte/)).toBeNull();

    getDetails.mockResolvedValueOnce({
      date: selected,
      direction: 'outflows',
      completeness: 'PARTIAL',
      total: '100.00',
      returnedSum: '40.00',
      difference: '60.00',
      hasMore: true,
      itemCount: 3,
      limit: 1,
      items: [
        {
          occurredOn: selected,
          attributedAmount: '40.00',
          partyName: null,
          description: null,
          displayLabel: 'Sem contraparte identificada',
          categoryNames: [],
          costCenterLabel: null,
        },
      ],
    });
    rerender(
      <DailyRealizedCashChart
        dailyPoints={daily}
        accumulatedPoints={accumulated}
        colorVar="--color-series-expense"
        dailyLabel="Pago por dia de baixa"
        accumulatedLabel="Acumulado"
        dailyAriaLabel="Despesas diárias"
        accumulatedAriaLabel="Acumulado do mês"
        dailyCaption="pago no dia"
        accumulatedCaption="acumulado"
        direction="outflows"
        selectedDate="2026-08-24"
        onSelectDate={onSelectDate}
        costCenterId={null}
        categoryId={null}
        chartClassName="chart"
        labelClassName="label"
      />,
    );
    expect(await screen.findByText('Exibindo parte dos lançamentos deste dia.')).toBeTruthy();
    expect(screen.getByText('O valor acima é o total do dia.')).toBeTruthy();
    expect(screen.getByText('Exibindo 1 de 3')).toBeTruthy();
    expect(screen.queryByText('3 pagamentos')).toBeNull();
    expect(
      screen.getByText((_, node) => node?.getAttribute('data-cash-day-total') === 'true').textContent,
    ).toMatch(/100,00/);

    getDetails.mockResolvedValueOnce({
      date: '2026-08-25',
      direction: 'inflows',
      completeness: 'COMPLETE',
      total: '0',
      returnedSum: '0',
      difference: '0',
      hasMore: false,
      itemCount: 0,
      limit: 40,
      items: [],
    });
    rerender(
      <DailyRealizedCashChart
        dailyPoints={daily}
        accumulatedPoints={accumulated}
        colorVar="--color-series-revenue"
        dailyLabel="Entradas por dia de baixa"
        accumulatedLabel="Acumulado"
        dailyAriaLabel="Faturamento diário"
        accumulatedAriaLabel="Acumulado do mês"
        dailyCaption="no dia"
        accumulatedCaption="acumulado"
        direction="inflows"
        selectedDate="2026-08-25"
        onSelectDate={onSelectDate}
        costCenterId={null}
        categoryId={null}
        chartClassName="chart"
        labelClassName="label"
      />,
    );
    expect(await screen.findByText('Nenhum lançamento neste dia.')).toBeTruthy();

    getDetails.mockResolvedValueOnce({
      date: '2026-08-25',
      direction: 'inflows',
      completeness: 'UNAVAILABLE',
      total: null,
      returnedSum: null,
      difference: null,
      hasMore: false,
      itemCount: 0,
      limit: 40,
      items: [],
    });
    rerender(
      <DailyRealizedCashChart
        dailyPoints={daily}
        accumulatedPoints={accumulated}
        colorVar="--color-series-revenue"
        dailyLabel="Entradas por dia de baixa"
        accumulatedLabel="Acumulado"
        dailyAriaLabel="Faturamento diário"
        accumulatedAriaLabel="Acumulado do mês"
        dailyCaption="no dia"
        accumulatedCaption="acumulado"
        direction="inflows"
        selectedDate="2026-08-26"
        onSelectDate={onSelectDate}
        costCenterId="cc-1"
        categoryId={null}
        chartClassName="chart"
        labelClassName="label"
      />,
    );
    expect(await screen.findByText(/Não foi possível detalhar/)).toBeTruthy();
    expect(screen.queryByText(/Total do dia/)).toBeNull();
    expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();

    getDetails.mockRejectedValueOnce(
      new DashboardCashRealizedDayDetailsRequestError('unavailable', 'Falha ao carregar o dia.'),
    );
    rerender(
      <DailyRealizedCashChart
        dailyPoints={daily}
        accumulatedPoints={accumulated}
        colorVar="--color-series-revenue"
        dailyLabel="Entradas por dia de baixa"
        accumulatedLabel="Acumulado"
        dailyAriaLabel="Faturamento diário"
        accumulatedAriaLabel="Acumulado do mês"
        dailyCaption="no dia"
        accumulatedCaption="acumulado"
        direction="inflows"
        selectedDate="2026-08-27"
        onSelectDate={onSelectDate}
        costCenterId={null}
        categoryId="cat-9"
        chartClassName="chart"
        labelClassName="label"
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(/Falha ao carregar o dia/);
    await waitFor(() => {
      expect(getDetails).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-9', costCenterId: null }),
      );
    });
  });
});

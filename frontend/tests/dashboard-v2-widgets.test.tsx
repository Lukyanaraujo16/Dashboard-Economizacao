import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CategoryRanking,
  CompactMonthEnd,
  CompetenceComparisonChart,
  ExecutiveKpiCard,
  ExecutiveSignals,
  ForecastPanel,
  MonthlyCompare,
  WidgetExpandDialog,
  accumulate,
  alignDailySeries,
  amountValues,
  buildSvgPoints,
  formatCompactBrl,
  formatDayPt,
  indexFromRatio,
  isFlatSeries,
  maxAbs,
  outstandingSeries,
  parseAmount,
  receivedSeries,
  resultDailySeries,
  signedSharePercent,
  subtractDecimalStrings,
  svgBaselineY,
  toAreaPath,
  toPolyline,
  type CategoryRankingItem,
  type CompetenceDailyPoint,
} from '../src/components/dashboard/v2';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('chart-math', () => {
  it('accumulate soma em centavos e mantém decimal-string', () => {
    expect(
      accumulate([
        { date: '2026-08-01', amount: '4000' },
        { date: '2026-08-02', amount: '6000.005' },
        { date: '2026-08-03', amount: '0' },
      ]),
    ).toEqual([
      { date: '2026-08-01', amount: '4000.00' },
      { date: '2026-08-02', amount: '10000.01' },
      { date: '2026-08-03', amount: '10000.01' },
    ]);
  });

  it('accumulate de série vazia não inventa pontos', () => {
    expect(accumulate([])).toEqual([]);
  });

  it('subtractDecimalStrings preserva centavos e sinal', () => {
    expect(subtractDecimalStrings('10000', '100')).toBe('9900.00');
    expect(subtractDecimalStrings('100', '150')).toBe('-50.00');
    expect(subtractDecimalStrings('0.10', '0.60')).toBe('-0.50');
    expect(subtractDecimalStrings('136856.54', '136856.54')).toBe('0.00');
  });

  it('subtractDecimalStrings trata entrada inválida como zero', () => {
    expect(subtractDecimalStrings('abc', '10')).toBe('-10.00');
    expect(subtractDecimalStrings('10', 'abc')).toBe('10.00');
  });

  it('parseAmount e maxAbs só entram na geometria', () => {
    expect(parseAmount('1234.56')).toBe(1234.56);
    expect(parseAmount('  -12  ')).toBe(-12);
    expect(parseAmount('R$ 12')).toBe(0);
    expect(maxAbs([-5, 3, 1])).toBe(5);
    expect(maxAbs([])).toBe(0);
    expect(
      amountValues([
        { date: '2026-08-01', amount: '10' },
        { date: '2026-08-02', amount: '-2.5' },
      ]),
    ).toEqual([10, -2.5]);
  });

  it('isFlatSeries cobre vazio e série integralmente zerada', () => {
    expect(isFlatSeries([])).toBe(true);
    expect(
      isFlatSeries([
        { date: '2026-08-01', amount: '0' },
        { date: '2026-08-02', amount: '0.00' },
      ]),
    ).toBe(true);
    expect(isFlatSeries([{ date: '2026-08-01', amount: '0.01' }])).toBe(false);
  });

  it('alignDailySeries preenche dias ausentes com zero em ambos os lados', () => {
    const aligned = alignDailySeries(
      [{ date: '2026-08-02', amount: '10' }],
      [{ date: '2026-08-01', amount: '5' }],
    );
    expect(aligned.dates).toEqual(['2026-08-01', '2026-08-02']);
    expect(aligned.first).toEqual([
      { date: '2026-08-01', amount: '0.00' },
      { date: '2026-08-02', amount: '10' },
    ]);
    expect(aligned.second).toEqual([
      { date: '2026-08-01', amount: '5' },
      { date: '2026-08-02', amount: '0.00' },
    ]);
  });

  it('buildSvgPoints escala pelo max compartilhado', () => {
    const points = buildSvgPoints([0, 5, 10], {
      width: 100,
      height: 50,
      padding: 5,
      max: 10,
    });
    expect(points).toEqual([
      { index: 0, x: 0, y: 45 },
      { index: 1, x: 50, y: 25 },
      { index: 2, x: 100, y: 5 },
    ]);
    expect(toPolyline(points)).toBe('0,45 50,25 100,5');
    expect(toAreaPath(points, 50)).toBe('M 0 50 L 0 45 L 50 25 L 100 5 L 100 50 Z');
    expect(toAreaPath([], 50)).toBe('');
  });

  it('indexFromRatio limita ao intervalo da série', () => {
    expect(indexFromRatio(0.5, 5)).toBe(2);
    expect(indexFromRatio(-1, 5)).toBe(0);
    expect(indexFromRatio(2, 5)).toBe(4);
    expect(indexFromRatio(0.5, 0)).toBe(-1);
  });

  it('buildSvgPoints assinado põe o zero no meio e aceita valores negativos', () => {
    const scale = { width: 100, height: 40, padding: 0, max: 10, signed: true };
    expect(buildSvgPoints([10, 0, -10], scale)).toEqual([
      { index: 0, x: 0, y: 0 },
      { index: 1, x: 50, y: 20 },
      { index: 2, x: 100, y: 40 },
    ]);
    expect(svgBaselineY(scale)).toBe(20);
    expect(svgBaselineY({ width: 100, height: 40, padding: 0 })).toBe(40);
  });

  it('buildSvgPoints padrão continua apoiando a série na base', () => {
    expect(
      buildSvgPoints([-10, 10], { width: 100, height: 40, padding: 0, max: 10 }),
    ).toEqual([
      { index: 0, x: 0, y: 40 },
      { index: 1, x: 100, y: 0 },
    ]);
  });

  it('formatDayPt e formatCompactBrl são rótulos, não valores de domínio', () => {
    expect(formatDayPt('2026-08-05')).toBe('05/08');
    expect(formatDayPt('sem data')).toBe('sem data');
    expect(formatCompactBrl(500)).toBe('R$\u00a0500');
    expect(formatCompactBrl(1500)).toBe('R$\u00a01,5\u00a0mil');
    expect(formatCompactBrl(2_500_000)).toBe('R$\u00a02,5\u00a0mi');
    expect(formatCompactBrl(-500)).toBe('-R$\u00a0500');
  });
});

describe('séries diárias de competência', () => {
  const daily: readonly CompetenceDailyPoint[] = [
    { date: '2026-08-01', amount: '4000', received: '1000', outstanding: '3000' },
    { date: '2026-08-02', amount: '0', received: '0', outstanding: '0' },
  ];

  it('receivedSeries e outstandingSeries expõem o snapshot do dia, não o total', () => {
    expect(receivedSeries(daily)).toEqual([
      { date: '2026-08-01', amount: '1000' },
      { date: '2026-08-02', amount: '0' },
    ]);
    expect(outstandingSeries(daily)).toEqual([
      { date: '2026-08-01', amount: '3000' },
      { date: '2026-08-02', amount: '0' },
    ]);
  });

  it('resultDailySeries alinha as datas e preserva o sinal em centavos', () => {
    expect(
      resultDailySeries(
        [
          { date: '2026-08-02', amount: '100' },
          { date: '2026-08-03', amount: '10.05' },
        ],
        [
          { date: '2026-08-01', amount: '30' },
          { date: '2026-08-02', amount: '150' },
        ],
      ),
    ).toEqual([
      { date: '2026-08-01', amount: '-30.00' },
      { date: '2026-08-02', amount: '-50.00' },
      { date: '2026-08-03', amount: '10.05' },
    ]);
  });

  it('resultDailySeries de séries vazias não inventa dias', () => {
    expect(resultDailySeries([], [])).toEqual([]);
  });

  it('signedSharePercent preserva o sinal e recusa total zero', () => {
    expect(signedSharePercent('9900', '10000')).toBe('99.0');
    expect(signedSharePercent('-500', '10000')).toBe('-5.0');
    expect(signedSharePercent('100', '0')).toBeNull();
  });
});

describe('MonthlyCompare', () => {
  const periods = [
    { id: '2026-07', label: 'JUL' },
    { id: '2026-08', label: 'AGO' },
  ];

  it('agrupa uma barra por competência em cada métrica sem valores no eixo', () => {
    render(
      <MonthlyCompare
        periods={periods}
        rows={[
          { id: 'billing', label: 'Faturamento', tone: 'revenue', amounts: ['8000', '10000'] },
          { id: 'expenses', label: 'Despesas', tone: 'expense', amounts: ['100', '100'] },
        ]}
      />,
    );
    expect(screen.getAllByText('JUL')).toHaveLength(2);
    expect(screen.getAllByText('AGO')).toHaveLength(2);
    // Valores completos saem do eixo (evita colisão) e permanecem no delta / aria.
    expect(screen.queryByText(/R\$\s*8\.000,00/)).toBeNull();
    expect(screen.queryByText(/R\$\s*10\.000,00/)).toBeNull();
    expect(screen.getByText(/R\$\s*2\.000,00/)).toBeTruthy();
    expect(screen.getByText('25,0%')).toBeTruthy();
    expect(screen.getByText(/R\$\s*0,00/)).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: /Faturamento\. JUL\/2026 R\$\s*8\.000,00; AGO\/2026 R\$\s*10\.000,00/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText('Comparação dos movimentos realizados entre os meses.'),
    ).toBeTruthy();
  });

  it('tooltip de hover expõe competência, indicador e valor — inclusive zero', () => {
    render(
      <MonthlyCompare
        periods={periods}
        rows={[
          { id: 'billing', label: 'Faturamento', tone: 'revenue', amounts: ['0', '10000'] },
        ]}
      />,
    );
    const plot = screen.getByRole('img', { name: /Faturamento/ });
    fireEvent.mouseMove(plot, { clientX: 0, clientY: 0 });
    // Sem bounding rect no jsdom o índice cai no último — valida o contrato do tooltip.
    Object.defineProperty(plot, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 40, right: 200, bottom: 40 }),
    });
    fireEvent.mouseMove(plot, { clientX: 20, clientY: 10 });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(within(tip).getByText('JUL/2026')).toBeTruthy();
    expect(within(tip).getByText('Faturamento')).toBeTruthy();
    expect(within(tip).getByText(/R\$\s*0,00/)).toBeTruthy();
  });

  it('base zero não inventa variação percentual', () => {
    render(
      <MonthlyCompare
        periods={periods}
        rows={[{ id: 'result', label: 'Resultado', tone: 'result', amounts: ['0', '-50'] }]}
      />,
    );
    // Apenas a variação no header (eixo não imprime mais o valor da barra).
    expect(screen.getAllByText(/-R\$\s*50,00/)).toHaveLength(1);
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(
      screen.getByRole('img', { name: /JUL\/2026 R\$\s*0,00; AGO\/2026 -R\$\s*50,00/ }),
    ).toBeTruthy();
  });

  it('sem métricas usa a mensagem vazia', () => {
    render(<MonthlyCompare periods={periods} rows={[]} emptyMessage="Sem competência anterior." />);
    expect(screen.getByText('Sem competência anterior.')).toBeTruthy();
  });
});

describe('CategoryRanking', () => {
  const items: readonly CategoryRankingItem[] = [
    { name: 'C1', amount: '50', percentage: '50' },
    { name: 'C2', amount: '20', percentage: '20' },
    { name: 'C3', amount: '10', percentage: '10' },
    { name: 'C4', amount: '8', percentage: '8' },
    { name: 'C5', amount: '7', percentage: '7' },
    { name: 'C6', amount: '3', percentage: '3' },
    { name: 'C7', amount: '2', percentage: '2' },
  ];

  it('mostra Top 5 por padrão e descarta o excedente', () => {
    render(<CategoryRanking items={items} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByText('C1')).toBeTruthy();
    expect(within(rows[0]!).getByText(/R\$\s*50,00/)).toBeTruthy();
    expect(within(rows[0]!).getByText('50,0%')).toBeTruthy();
    expect(screen.queryByText('C6')).toBeNull();
    expect(screen.queryByText('C7')).toBeNull();
  });

  it('maxItems permite abrir todas as categorias', () => {
    render(<CategoryRanking items={items} maxItems={items.length} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByText('C7')).toBeTruthy();
  });

  it('lista vazia usa a mensagem informada', () => {
    render(<CategoryRanking items={[]} emptyMessage="Nenhuma categoria na competência." />);
    expect(screen.getByText('Nenhuma categoria na competência.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('WidgetExpandDialog', () => {
  function renderDialog(onClose = vi.fn()) {
    render(
      <ThemeProvider>
        <WidgetExpandDialog
          open
          title="Faturamento"
          subtitle="Competência de ago/2026"
          onClose={onClose}
        >
          <p>Conteúdo do detalhe</p>
        </WidgetExpandDialog>
      </ThemeProvider>,
    );
    return onClose;
  }

  it('renderiza como diálogo modal rotulado e recebe foco', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
    expect(within(dialog).getByText('Competência de ago/2026')).toBeTruthy();
    expect(within(dialog).getByText('Conteúdo do detalhe')).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('fecha com ESC', () => {
    const onClose = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignora outras teclas e fecha ao clicar fora ou no botão Fechar', () => {
    const onClose = renderDialog();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByRole('dialog').parentElement;
    expect(overlay).toBeTruthy();
    fireEvent.mouseDown(overlay as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('fechado não renderiza nada', () => {
    render(
      <ThemeProvider>
        <WidgetExpandDialog open={false} title="Faturamento" onClose={vi.fn()}>
          <p>Conteúdo do detalhe</p>
        </WidgetExpandDialog>
      </ThemeProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ExecutiveKpiCard', () => {
  it('estado ready mostra valor, meta e série diária', () => {
    render(
      <ExecutiveKpiCard
        title="Faturamento"
        tone="revenue"
        state="ready"
        value={'R$\u00a010.000,00'}
        meta="Gerado até agora"
        sparklinePoints={[
          { date: '2026-08-01', amount: '4000' },
          { date: '2026-08-02', amount: '6000' },
        ]}
      />,
    );
    const card = screen.getByRole('heading', { name: 'Faturamento' }).closest('[data-tone]');
    expect(card?.getAttribute('data-state')).toBe('ready');
    expect(screen.getByText('Gerado até agora')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Faturamento — série diária por competência' }),
    ).toBeTruthy();
  });

  it('estado empty não inventa zero e não expõe expandir', () => {
    render(
      <ExecutiveKpiCard
        title="Despesas"
        tone="expense"
        state="empty"
        emptyMessage="Sem despesas na competência"
      />,
    );
    expect(screen.getByText('Sem despesas na competência')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Expandir' })).toBeNull();
  });

  it('expandir só aparece com handler e sinaliza o clique', () => {
    const onExpand = vi.fn();
    render(
      <ExecutiveKpiCard
        title="Despesas"
        tone="expense"
        state="ready"
        value={'R$\u00a0100,00'}
        expandable
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('estado loading anuncia carregamento sem valor', () => {
    render(<ExecutiveKpiCard title="A receber" tone="receivable" state="loading" />);
    expect(screen.getByRole('status', { name: 'Carregando indicador' })).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('série de snapshot usa o próprio rótulo e nunca fala de recebido no dia', () => {
    render(
      <ExecutiveKpiCard
        title="Já recebido"
        tone="received"
        state="ready"
        value={'R$\u00a04.000,00'}
        sparklinePoints={[
          { date: '2026-08-01', amount: '1000' },
          { date: '2026-08-02', amount: '3000' },
        ]}
        sparklineAriaLabel="Valor atualmente recebido dos títulos com competência neste dia"
        sparklineCaption="Valor atualmente recebido dos títulos com competência neste dia"
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Valor atualmente recebido dos títulos com competência neste dia',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /recebido neste dia/i })).toBeNull();
  });

  it('série assinada do resultado desenha valores negativos', () => {
    render(
      <ExecutiveKpiCard
        title="Resultado gerencial"
        tone="result"
        state="ready"
        value={'-R$\u00a050,00'}
        sparklinePoints={[
          { date: '2026-08-01', amount: '100' },
          { date: '2026-08-02', amount: '-150' },
        ]}
        sparklineAriaLabel="Resultado gerencial da competência no dia"
        sparklineSigned
      />,
    );
    const chart = screen.getByRole('img', { name: 'Resultado gerencial da competência no dia' });
    const polyline = chart.querySelector('polyline');
    expect(polyline?.getAttribute('points')).toBe('0,8 120,33');
  });

  it('rodapé do card aparece junto da série', () => {
    render(
      <ExecutiveKpiCard
        title="Faturamento"
        tone="revenue"
        state="ready"
        value={'R$\u00a010.000,00'}
        sparklinePoints={[{ date: '2026-08-01', amount: '10000' }]}
        footer={<span>Recebido</span>}
      />,
    );
    expect(screen.getByText('Recebido')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Faturamento — série diária por competência' }),
    ).toBeTruthy();
  });
});

describe('CompetenceComparisonChart', () => {
  it('série zerada em ambos os lados usa estado vazio da competência', () => {
    render(
      <CompetenceComparisonChart
        revenueDaily={[{ date: '2026-08-01', amount: '0' }]}
        expenseDaily={[]}
        monthKey="2026-08"
      />,
    );
    expect(
      screen.getByText('Sem receitas ou despesas na competência de ago/2026.'),
    ).toBeTruthy();
  });

  it('com movimento expõe gráfico rotulado e legenda', () => {
    render(
      <CompetenceComparisonChart
        revenueDaily={[
          { date: '2026-08-01', amount: '100' },
          { date: '2026-08-02', amount: '200' },
        ]}
        expenseDaily={[{ date: '2026-08-02', amount: '50' }]}
        monthKey="2026-08"
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Receitas e despesas acumuladas por competência em ago/2026',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Receitas')).toBeTruthy();
    expect(screen.getByText('Despesas')).toBeTruthy();
    expect(
      screen.getByText(
        'Acumulado por competência no mês selecionado. Não representa saldo bancário.',
      ),
    ).toBeTruthy();
  });
});

describe('CompactMonthEnd', () => {
  it('usa o summary do backend e não chama de saldo bancário', () => {
    render(
      <CompactMonthEnd
        summary={{ receivable: '8.5', payable: '4', net: '4.5' }}
        remainingDays={13}
      />,
    );
    expect(screen.getByText('Faltam 13 dias no mês')).toBeTruthy();
    expect(screen.getByText(/R\$\s*8,50/)).toBeTruthy();
    expect(screen.getByText(/R\$\s*4,00/)).toBeTruthy();
    expect(screen.getByText(/R\$\s*4,50/)).toBeTruthy();
    expect(screen.getByText('Diferença prevista; não é saldo bancário.')).toBeTruthy();
  });

  it('singular e último dia do mês têm copy própria', () => {
    const { rerender } = render(
      <CompactMonthEnd summary={{ receivable: '0', payable: '0', net: '0' }} remainingDays={1} />,
    );
    expect(screen.getByText('Falta 1 dia no mês')).toBeTruthy();
    rerender(
      <CompactMonthEnd summary={{ receivable: '0', payable: '0', net: '0' }} remainingDays={0} />,
    );
    expect(screen.getByText('Último dia do mês')).toBeTruthy();
  });
});

describe('ForecastPanel', () => {
  it('horizonte integralmente zerado usa estado vazio', () => {
    render(<ForecastPanel buckets={[{ key: '2026-08', inflows: '0', outflows: '0', net: '0' }]} />);
    expect(screen.getByText('Sem lançamentos previstos no horizonte.')).toBeTruthy();
  });

  it('resume picos e mantém o líquido do backend', () => {
    render(
      <ForecastPanel
        buckets={[
          { key: '2026-08', inflows: '10', outflows: '4', net: '6' },
          { key: '2026-09', inflows: '2', outflows: '8', net: '-6' },
        ]}
      />,
    );
    expect(screen.getByText('Meses previstos')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*6,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/-R\$\s*6,00/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'O líquido é a diferença prevista de cada mês e não o saldo bancário acumulado.',
      ),
    ).toBeTruthy();
  });
});

describe('ExecutiveSignals', () => {
  it('marca o sinal de atenção e separa a primeira frase', () => {
    render(
      <ExecutiveSignals
        signals={[
          {
            id: 'expense-classification-gap',
            body: '20,0% das despesas do mês estão sem categoria. Classifique para melhorar a leitura.',
          },
        ]}
      />,
    );
    expect(screen.getByText('20,0% das despesas do mês estão sem categoria.')).toBeTruthy();
    expect(screen.getByText('Classifique para melhorar a leitura.')).toBeTruthy();
    expect(
      document.querySelector('[data-signal="expense-classification-gap"]'),
    ).toBeTruthy();
  });

  it('sem sinais usa a mensagem vazia', () => {
    render(<ExecutiveSignals signals={[]} emptyMessage="Sem sinais nesta competência." />);
    expect(screen.getByText('Sem sinais nesta competência.')).toBeTruthy();
  });
});

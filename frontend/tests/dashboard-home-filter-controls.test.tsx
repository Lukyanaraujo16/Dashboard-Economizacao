/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardSituationSelector } from '../src/components/dashboard/dashboard-situation-selector';
import { DashboardCategorySelector } from '../src/components/dashboard/dashboard-category-selector';
import type { DashboardCategoryItem } from '../src/services/dashboard/categories.types';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
});

const items: readonly DashboardCategoryItem[] = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Serviços', type: 'REVENUE' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Assinaturas', type: 'REVENUE' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Folha', type: 'EXPENSE' },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Aluguel', type: 'EXPENSE' },
  { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Ajuste', type: 'UNKNOWN' },
];

describe('DashboardSituationSelector', () => {
  it('mostra labels humanas e notifica troca', () => {
    const onSelect = vi.fn();
    render(
      <ThemeProvider>
        <DashboardSituationSelector selected={null} onSelect={onSelect} />
      </ThemeProvider>,
    );
    const select = screen.getByLabelText('Situação') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Todas' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Quitado' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Em aberto' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Vencido' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'settled' } });
    expect(onSelect).toHaveBeenCalledWith('settled');
  });
});

describe('DashboardCategorySelector', () => {
  it('agrupa Categorias de receita/despesa, busca e escolhe Todas', () => {
    const onSelect = vi.fn();
    render(
      <ThemeProvider>
        <DashboardCategorySelector
          items={items}
          selectedId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
          onSelect={onSelect}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Categoria: Folha/ }));
    expect(screen.getByText('Categorias de receita')).toBeTruthy();
    expect(screen.getByText('Categorias de despesa')).toBeTruthy();
    expect(screen.getByText('Não classificadas')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'alug' } });
    expect(screen.queryByRole('option', { name: 'Folha' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Aluguel' })).toBeTruthy();
    expect(screen.queryByText('Categorias de receita')).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Aluguel' }));
    expect(onSelect).toHaveBeenCalledWith('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('busca com match em receita e despesa mantém grupos separados', () => {
    render(
      <ThemeProvider>
        <DashboardCategorySelector items={items} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Categoria:/ }));
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'a' } });
    expect(screen.getByText('Categorias de receita')).toBeTruthy();
    expect(screen.getByText('Categorias de despesa')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Assinaturas' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Aluguel' })).toBeTruthy();
  });

  it('busca só receita exibe apenas grupo de receita', () => {
    render(
      <ThemeProvider>
        <DashboardCategorySelector items={items} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Categoria:/ }));
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'serv' } });
    expect(screen.getByText('Categorias de receita')).toBeTruthy();
    expect(screen.queryByText('Categorias de despesa')).toBeNull();
  });

  it('Todas as categorias notifica null e erro do catálogo fica no controle', () => {
    const onSelect = vi.fn();
    render(
      <ThemeProvider>
        <DashboardCategorySelector
          items={items}
          selectedId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
          onSelect={onSelect}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Categoria: Folha/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Todas as categorias' }));
    expect(onSelect).toHaveBeenCalledWith(null);

    render(
      <ThemeProvider>
        <DashboardCategorySelector
          items={[]}
          selectedId={null}
          onSelect={() => undefined}
          error
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Não foi possível carregar as categorias.')).toBeTruthy();
  });

  it('catálogo vazio não renderiza; loading não bloqueia fora do controle', () => {
    const { container } = render(
      <ThemeProvider>
        <DashboardCategorySelector items={[]} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    expect(container.querySelector('[data-category-selector]')).toBeNull();

    render(
      <ThemeProvider>
        <DashboardCategorySelector
          items={[]}
          selectedId={null}
          onSelect={() => undefined}
          loading
        />
      </ThemeProvider>,
    );
    expect((screen.getByRole('button', { name: /Carregando/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('muitas categorias continuam navegáveis na lista', () => {
    const many: DashboardCategoryItem[] = Array.from({ length: 40 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Categoria ${index + 1}`,
      type: index % 2 === 0 ? 'REVENUE' : 'EXPENSE',
    }));
    render(
      <ThemeProvider>
        <DashboardCategorySelector items={many} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Categoria:/ }));
    const list = screen.getByRole('listbox', { name: 'Categorias' });
    expect(within(list).getAllByRole('option').length).toBe(41);
  });

  it('categoria longa preserva nome acessível e não quebra o trigger', () => {
    const longName = 'Descontos financeiros obtidos';
    const extremeName =
      'Descontos financeiros obtidos em renegociações extraordinárias de contratos de longo prazo';
    const longId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const onSelect = vi.fn();
    const { rerender } = render(
      <ThemeProvider>
        <DashboardCategorySelector
          items={[
            { id: longId, name: longName, type: 'EXPENSE' },
            { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: extremeName, type: 'EXPENSE' },
            { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Folha', type: 'EXPENSE' },
          ]}
          selectedId={longId}
          onSelect={onSelect}
        />
      </ThemeProvider>,
    );

    const trigger = screen.getByRole('button', { name: `Categoria: ${longName}` });
    expect(trigger.getAttribute('title')).toBe(longName);
    expect(trigger.className).toMatch(/trigger/);
    const triggerText = trigger.querySelector('[class*="triggerText"]');
    expect(triggerText?.textContent).toBe(longName);

    fireEvent.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Categorias' });
    expect(within(list).getByRole('option', { name: longName })).toBeTruthy();
    fireEvent.click(within(list).getByRole('option', { name: extremeName }));
    expect(onSelect).toHaveBeenCalledWith('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    rerender(
      <ThemeProvider>
        <DashboardCategorySelector
          items={[
            { id: longId, name: longName, type: 'EXPENSE' },
            { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: extremeName, type: 'EXPENSE' },
            { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Folha', type: 'EXPENSE' },
          ]}
          selectedId={null}
          onSelect={onSelect}
        />
      </ThemeProvider>,
    );
    const reset = screen.getByRole('button', { name: 'Categoria: Todas as categorias' });
    expect(reset.getAttribute('title')).toBe('Todas as categorias');
  });
});

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardCostCenterSelector } from '../src/components/dashboard/dashboard-cost-center-selector';
import type { DashboardCostCenterItem } from '../src/services/dashboard/cost-centers.types';

afterEach(() => {
  cleanup();
});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function centers(count: number): DashboardCostCenterItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    code: null,
    name:
      index % 7 === 0
        ? `Centro com nome muito longo para ellipsis ${index} Clínica Life Unidade Especial`
        : `Centro ${index + 1}`,
    active: index % 11 !== 0,
  }));
}

describe('DashboardCostCenterSelector tabs (CC1.3)', () => {
  it('não renderiza com 0 centros', () => {
    const { container } = render(
      <DashboardCostCenterSelector items={[]} selectedId={null} onSelect={() => undefined} />,
    );
    expect(container.querySelector('[data-cost-center-selector]')).toBeNull();
  });

  it('renderiza Todos + centros e troca seleção', () => {
    const onSelect = vi.fn();
    render(
      <DashboardCostCenterSelector
        items={[
          { id: A, code: null, name: 'Jacaraípe', active: true },
          { id: B, code: null, name: 'Laranjeiras', active: true },
        ]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Centros de custo' });
    expect(within(list).getByRole('tab', { name: 'Todos' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(within(list).getByRole('tab', { name: 'Jacaraípe' }));
    expect(onSelect).toHaveBeenCalledWith(A);
  });

  it('suporta 100 centros sem quebrar tablist', () => {
    const items = centers(100);
    render(
      <DashboardCostCenterSelector items={items} selectedId={items[50]!.id} onSelect={() => undefined} />,
    );
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(101);
    expect(document.querySelector('[data-cost-center-tabs="true"]')).toBeTruthy();
  });

  it('keyboard ArrowRight move seleção', () => {
    const onSelect = vi.fn();
    render(
      <DashboardCostCenterSelector
        items={[
          { id: A, code: null, name: 'Jacaraípe', active: true },
          { id: B, code: null, name: 'Laranjeiras', active: true },
        ]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const todos = screen.getByRole('tab', { name: 'Todos' });
    fireEvent.keyDown(todos, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith(A);
  });
});

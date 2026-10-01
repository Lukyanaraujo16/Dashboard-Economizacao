/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sparkline } from '../src/components/dashboard/v2';

afterEach(() => {
  cleanup();
});

const points = [
  { date: '2026-08-24', amount: '10' },
  { date: '2026-08-25', amount: '20' },
  { date: '2026-08-26', amount: '30' },
];

function mockWidth(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      width: 300,
      height: 40,
      left: 0,
      top: 0,
      right: 300,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

describe('Sparkline — seleção de ponto', () => {
  it('preserva o hover e não seleciona sem callback', () => {
    const onPointSelect = vi.fn();
    render(<Sparkline points={points} interactive ariaLabel="Série" valueCaption="no dia" />);
    const plot = screen.getByRole('img', { name: 'Série' });
    mockWidth(plot);
    fireEvent.mouseMove(plot, { clientX: 150, clientY: 10 });
    expect(screen.getByText('25/08')).toBeTruthy();
    fireEvent.click(plot, { clientX: 150, clientY: 10 });
    expect(onPointSelect).not.toHaveBeenCalled();
  });

  it('clique e toque selecionam o dia e o mesmo índice usa a data do ponto', () => {
    const onPointSelect = vi.fn();
    render(
      <Sparkline points={points} interactive ariaLabel="Série" onPointSelect={onPointSelect} />,
    );
    const plot = screen.getByRole('img', { name: /Série/ });
    mockWidth(plot);
    fireEvent.mouseMove(plot, { clientX: 20, clientY: 10 });
    expect(screen.getByText('24/08')).toBeTruthy();
    fireEvent.click(plot, { clientX: 150, clientY: 10 });
    expect(onPointSelect).toHaveBeenCalledWith({ date: '2026-08-25', amount: '20', index: 1 });
    fireEvent.touchEnd(plot, { changedTouches: [{ clientX: 290, clientY: 10 }] });
    expect(onPointSelect).toHaveBeenLastCalledWith({
      date: '2026-08-26',
      amount: '30',
      index: 2,
    });
  });

  it('setas continuam navegando e Enter ou Espaço selecionam o ponto focalizado', () => {
    const onPointSelect = vi.fn();
    render(
      <Sparkline points={points} interactive ariaLabel="Série" onPointSelect={onPointSelect} />,
    );
    const plot = screen.getByRole('img', { name: /Enter ou Espaço/ });
    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(onPointSelect).toHaveBeenCalledWith({ date: '2026-08-24', amount: '10', index: 0 });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: ' ' });
    expect(onPointSelect).toHaveBeenLastCalledWith({
      date: '2026-08-25',
      amount: '20',
      index: 1,
    });
  });

  it('mantém o marcador do dia selecionado depois do hover', () => {
    render(
      <Sparkline
        points={points}
        interactive
        ariaLabel="Série"
        selectedDate="2026-08-25"
        onPointSelect={vi.fn()}
      />,
    );
    const plot = screen.getByRole('img', { name: /Série/ });
    mockWidth(plot);
    expect(plot.querySelector('[data-sparkline-selected="true"]')).toBeTruthy();
    fireEvent.mouseMove(plot, { clientX: 20, clientY: 10 });
    expect(screen.getByText('24/08')).toBeTruthy();
    expect(plot.querySelector('[data-sparkline-selected="true"]')).toBeTruthy();
    fireEvent.mouseLeave(plot);
    expect(screen.queryByText('24/08')).toBeNull();
    expect(plot.querySelector('[data-sparkline-selected="true"]')).toBeTruthy();
  });
});

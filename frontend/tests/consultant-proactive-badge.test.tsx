import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsultantFab } from '../src/components/consultant/consultant-fab';
import styles from '../src/components/consultant/consultant.module.css';

afterEach(() => {
  cleanup();
});

describe('indicador proativo da Lia', () => {
  it('não mostra badge nem balão sem aviso', () => {
    render(<ConsultantFab onOpen={() => undefined} available showBalloon consultantName="Lia" />);
    expect(screen.getByRole('button', { name: 'Falar com Lia' }).textContent).not.toMatch(/\d/);
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'A Lia tem algo novo' })).toBeNull();
  });

  it('mostra 1 e 3 fora do botão, dentro do agrupamento visível', () => {
    const { rerender } = render(
      <ConsultantFab onOpen={() => undefined} available unreadCount={1} consultantName="Lia" />,
    );
    const one = screen.getByRole('button', { name: /1 aviso novo/ });
    expect(one.textContent).not.toContain('1');
    expect(screen.getByText('1').className).toContain(styles.fabBadge);
    expect(one.parentElement?.className).toContain(styles.fabAnchor);
    expect(one.closest(`.${styles.fabCluster}`)?.className).toContain(styles.fabCluster);

    rerender(<ConsultantFab onOpen={() => undefined} available unreadCount={3} consultantName="Lia" />);
    const three = screen.getByRole('button', { name: /3 avisos novos/ });
    expect(three.contains(screen.getByText('3'))).toBe(false);
    expect(screen.getByText('3').parentElement).toBe(three.parentElement);
  });

  it('mostra 9+ e o balão sem marcar leitura ao fechar', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ConsultantFab
        onOpen={onOpen}
        onDismissBalloon={onDismiss}
        available
        unreadCount={12}
        showBalloon
        pulse
        consultantName="Lia"
      />,
    );
    expect(screen.getByText('9+')).toBeTruthy();
    expect(screen.getByRole('button', { name: /12 avisos novos/ }).className).toContain(styles.fabPulse);
    expect(screen.getByText('Identifiquei 12 situações que merecem sua atenção.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso da Lia' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('abre a Lia pelo balão e pelo atalho', () => {
    const onOpen = vi.fn();
    render(
      <ConsultantFab onOpen={onOpen} available unreadCount={1} showBalloon consultantName="Lia" />,
    );
    fireEvent.click(screen.getByText('A Lia tem algo novo para te contar.'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver agora' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

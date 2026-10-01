import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConsultantFab } from '../src/components/consultant/consultant-fab';

afterEach(() => {
  cleanup();
});

describe('indicador proativo da Lia', () => {
  it('mostra a quantidade no botão quando há aviso não lido', () => {
    render(
      <ConsultantFab onOpen={() => undefined} available unreadCount={2} consultantName="Lia" />,
    );
    const button = screen.getByRole('button', { name: /2 avisos novos/ });
    expect(button.textContent).toContain('2');
  });

  it('não mostra contador quando não há aviso', () => {
    render(<ConsultantFab onOpen={() => undefined} available consultantName="Lia" />);
    expect(screen.getByRole('button', { name: 'Falar com Lia' }).textContent).not.toMatch(/\d/);
  });
});

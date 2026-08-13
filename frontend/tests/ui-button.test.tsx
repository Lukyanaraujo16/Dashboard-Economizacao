import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../src/components/ui/button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renderiza children', () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('respeita disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading impede clique e comunica busy', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enviar
      </Button>,
    );
    const button = screen.getByRole('button', { name: /enviar/i });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('dispara click quando habilitado', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ok</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

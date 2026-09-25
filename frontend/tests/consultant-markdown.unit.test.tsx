import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConsultantMarkdown } from '../src/components/consultant/consultant-markdown';

describe('ConsultantMarkdown', () => {
  it('renderiza negrito, itálico, listas e parágrafos', () => {
    render(
      <ConsultantMarkdown text={'**Análise de serviços**\n\nTexto em *destaque*.\n\n- Caixa\n- Despesas\n\n1. Um\n2. Dois'} />,
    );
    expect(screen.getByText('Análise de serviços').tagName).toBe('STRONG');
    expect(screen.getByText('destaque').tagName).toBe('EM');
    expect(screen.getByText('Caixa').closest('ul')).toBeTruthy();
    expect(screen.getByText('Um').closest('ol')).toBeTruthy();
  });

  it('não interpreta HTML, script ou imagens', () => {
    const { container } = render(
      <ConsultantMarkdown text={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(1)">x</a>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

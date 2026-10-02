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

  it('mantém parágrafos, lista e negrito da consolidação sem executar HTML', () => {
    const { container } = render(
      <ConsultantMarkdown
        text={[
          'Identifiquei **3 contas a pagar** com vencimento nos próximos dias:',
          '',
          '- **03/10** — R$ 250,00',
          '- **04/10** — R$ 1.550,24',
          '- **05/10** — R$ 2.150,20',
          '',
          '**Total: R$ 3.950,44**',
          '',
          'Vale acompanhar esses vencimentos.',
          '',
          '**sem fechar',
          '',
          '<script>alert(1)</script>',
          '<iframe src="https://evil.example"></iframe>',
        ].join('\n')}
      />,
    );
    expect(screen.getByText('3 contas a pagar').tagName).toBe('STRONG');
    expect(screen.getByText('03/10').closest('li')?.parentElement?.tagName).toBe('UL');
    expect(screen.getByText('Total: R$ 3.950,44').tagName).toBe('STRONG');
    expect(screen.getByText('Vale acompanhar esses vencimentos.').closest('p')).toBeTruthy();
    expect(container.querySelectorAll('p').length).toBeGreaterThan(1);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('**sem fechar');
    expect(container.textContent).toContain('<script>alert(1)</script>');
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

/** @vitest-environment jsdom */
import { cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/components/layout/app-shell';
import { LoginExperience } from '../src/login/login-experience';
import { ThemeProvider } from '../src/theme';
import { renderWithAuth } from './helpers/render-with-auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
});

function expectDeveloperLink(link: HTMLElement): void {
  expect(link.getAttribute('href')).toBe('https://lukyanaraujo.com');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
  expect(link.getAttribute('rel')).toContain('noreferrer');
  expect(link.textContent?.trim()).toBe('');
  const icon = link.querySelector('img');
  expect(icon?.getAttribute('src')).toBe('/brand/lukyan-araujo-mark.png');
  expect(icon?.getAttribute('width')).toBe('16');
  expect(icon?.getAttribute('height')).toBe('16');
}

describe('assinatura institucional', () => {
  it('login mostra o rodapé com o ícone oficial e o link externo', () => {
    renderWithAuth(<LoginExperience />);
    expect(screen.getByText('© 2026 Economização · Todos os direitos reservados')).toBeTruthy();
    expect(screen.getByText('Desenvolvido por')).toBeTruthy();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).not.toContain('Lukyan Araújo');
    expect(footer.getAttribute('data-institutional-footer')).toBe('login');
    expectDeveloperLink(screen.getByRole('link', { name: 'Lukyan Araújo' }));
  });

  it('área autenticada mostra o rodapé no fluxo da página, sem posição fixa', () => {
    renderWithAuth(
      <ThemeProvider>
        <AppShell>
          <p>Conteúdo da página</p>
        </AppShell>
      </ThemeProvider>,
    );
    expect(screen.getByText('Conteúdo da página')).toBeTruthy();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).not.toContain('Lukyan Araújo');
    expect(footer.getAttribute('data-institutional-footer')).toBe('app');
    expect(footer.compareDocumentPosition(screen.getByText('Conteúdo da página'))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    expectDeveloperLink(screen.getByRole('link', { name: 'Lukyan Araújo' }));

    const css = readFileSync(
      join(process.cwd(), 'src/components/layout/institutional-footer.module.css'),
      'utf8',
    );
    expect(css).not.toMatch(/position:\s*(fixed|sticky|absolute)/);
    expect(css).toMatch(/justify-content:\s*center/);
    expect(css).toMatch(/@media \(max-width: 767px\)/);
    expect(css).toMatch(/flex-direction:\s*column/);
    expect(css).toMatch(/white-space:\s*nowrap/);

    const shellCss = readFileSync(
      join(process.cwd(), 'src/components/layout/app-shell.module.css'),
      'utf8',
    );
    expect(shellCss).toMatch(/\.main\s*\{[^}]*display:\s*flex/s);
    expect(shellCss).toMatch(/\.main\s*\{[^}]*flex-direction:\s*column/s);
    expect(shellCss).toMatch(/\.content\s*\{[^}]*flex:\s*1\s+0\s+auto/s);
    expect(shellCss).not.toMatch(/\.pageEnd\s*\{[^}]*position:\s*(fixed|sticky|absolute)/s);
  });
});
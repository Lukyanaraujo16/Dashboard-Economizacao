import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next usa jsx:preserve; Vitest/Vite precisam transformar JSX nos testes.
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  css: {
    modules: {
      classNameStrategy: 'non-scoped',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
});

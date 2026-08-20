import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/components/layout/app-shell.module.css'),
  'utf8',
);

describe('app-shell sidebar', () => {
  it('desktop usa sticky com altura de viewport e overflow interno', () => {
    const desktop = css.match(/@media \(min-width: 768px\) \{([\s\S]*?)\n\}/);
    expect(desktop?.[1]).toMatch(/position:\s*sticky/);
    expect(desktop?.[1]).toMatch(/height:\s*100svh/);
    expect(desktop?.[1]).toMatch(/overflow-y:\s*auto/);
    expect(desktop?.[1]).toMatch(/align-self:\s*start/);
  });

  it('mobile empilhado não aplica sticky na sidebar', () => {
    const mobile = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}\s*$/);
    expect(mobile?.[1]).not.toMatch(/position:\s*sticky/);
    expect(mobile?.[1]).toMatch(/grid-template-columns:\s*1fr/);
  });
});

import { describe, expect, it } from 'vitest';

import { isDevUiEnabled } from '../src/dev/is-dev-ui-enabled';

describe('playground produção', () => {
  it('fica desabilitado em production', () => {
    expect(isDevUiEnabled('production')).toBe(false);
  });

  it('fica habilitado em development e test', () => {
    expect(isDevUiEnabled('development')).toBe(true);
    expect(isDevUiEnabled('test')).toBe(true);
  });
});

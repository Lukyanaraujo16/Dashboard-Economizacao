import { describe, expect, it } from 'vitest';

import { detectAllowedLogoMimeType } from '../src/modules/branding/domain/logo-mime.js';
import { JPEG_FIXTURE, PNG_1X1, SVG_FIXTURE, WEBP_FIXTURE } from './helpers/image-fixtures.js';

describe('detecção MIME de logo', () => {
  it('aceita PNG, JPEG e WebP por magic bytes', () => {
    expect(detectAllowedLogoMimeType(PNG_1X1)).toBe('image/png');
    expect(detectAllowedLogoMimeType(JPEG_FIXTURE)).toBe('image/jpeg');
    expect(detectAllowedLogoMimeType(WEBP_FIXTURE)).toBe('image/webp');
  });

  it('rejeita SVG e conteúdo sem assinatura permitida', () => {
    expect(detectAllowedLogoMimeType(SVG_FIXTURE)).toBeNull();
    expect(detectAllowedLogoMimeType(Buffer.from('not-an-image'))).toBeNull();
  });
});

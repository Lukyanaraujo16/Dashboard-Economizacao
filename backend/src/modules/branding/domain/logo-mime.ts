export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AllowedLogoMimeType = (typeof ALLOWED_LOGO_MIME_TYPES)[number];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Detecção por assinatura (magic bytes) — não é parser de imagem.
 * Allowlist fechada: PNG, JPEG, WebP. SVG e demais formatos retornam null.
 */
export function detectAllowedLogoMimeType(body: Buffer): AllowedLogoMimeType | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (body.length >= 3 && body.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function extensionForLogoMimeType(mimeType: AllowedLogoMimeType): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
  }
}

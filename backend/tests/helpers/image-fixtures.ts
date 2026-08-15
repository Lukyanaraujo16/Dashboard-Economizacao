/** 1×1 PNG */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** JPEG mínimo com assinatura FF D8 FF */
export const JPEG_FIXTURE = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(32, 0),
  Buffer.from([0xff, 0xd9]),
]);

/** WebP RIFF....WEBP */
export const WEBP_FIXTURE = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
  Buffer.alloc(16, 0),
]);

export const SVG_FIXTURE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
  'utf8',
);

export function oversizedPng(bytes = 2 * 1024 * 1024 + 1): Buffer {
  const body = Buffer.alloc(bytes, 0);
  PNG_1X1.copy(body, 0, 0, Math.min(PNG_1X1.length, bytes));
  return body;
}

export function buildMultipartPayload(options: {
  fieldName?: string;
  filename?: string;
  mimeType?: string;
  body: Buffer;
}): { payload: Buffer; contentType: string } {
  const boundary = '----dashboard-test-boundary';
  const fieldName = options.fieldName ?? 'logo';
  const filename = options.filename ?? 'logo.png';
  const mimeType = options.mimeType ?? 'image/png';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([header, options.body, footer]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

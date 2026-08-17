const RUNTIME_FAVICON_ATTR = 'data-runtime-favicon';
const DEFAULT_DOCUMENT_TITLE = 'Economização';

export type ApplyDocumentBrandingInput = {
  readonly name?: string | null;
  readonly faviconUrl?: string | null;
  readonly updatedAt?: string | null;
};

/**
 * Aplica título do documento e favicon dinâmico a partir do branding ativo.
 * Sem faviconUrl: remove o `<link>` runtime (não há favicon.ico padrão no public/).
 */
export function applyDocumentBranding(input: ApplyDocumentBrandingInput): void {
  if (typeof document === 'undefined') {
    return;
  }

  const trimmedName = input.name?.trim();
  document.title = trimmedName || DEFAULT_DOCUMENT_TITLE;

  const existing = document.head.querySelector<HTMLLinkElement>(
    `link[${RUNTIME_FAVICON_ATTR}="true"]`,
  );

  const faviconUrl = input.faviconUrl?.trim() || null;
  if (!faviconUrl) {
    existing?.remove();
    return;
  }

  const cacheBust = encodeURIComponent(input.updatedAt ?? '0');
  const separator = faviconUrl.includes('?') ? '&' : '?';
  const href = `${faviconUrl}${separator}v=${cacheBust}`;

  let link = existing;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.setAttribute(RUNTIME_FAVICON_ATTR, 'true');
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Contraste WCAG 2.x para pares hex #RRGGBB.
 * Fórmula oficial de luminância relativa e razão de contraste.
 */

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function channelToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** Normaliza entrada hex para #RRGGBB ou null se inválida. */
export function normalizeHexInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_PATTERN.test(withHash)) {
    return null;
  }
  return withHash.toUpperCase();
}

/** Luminância relativa (WCAG 2) — faixa 0–1. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHexRgb(hex);
  if (!rgb) {
    return null;
  }
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG (mais clara / mais escura), ≥ 1. */
export function contrastRatio(foregroundHex: string, backgroundHex: string): number | null {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  if (l1 === null || l2 === null) {
    return null;
  }
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Texto normal: mínimo 4.5:1 (WCAG AA). */
export const WCAG_AA_NORMAL_TEXT_RATIO = 4.5;

export function evaluateWcagAaNormalText(
  foregroundHex: string,
  backgroundHex: string,
): { readonly ok: boolean; readonly ratio: number | null } {
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  if (ratio === null) {
    return { ok: false, ratio: null };
  }
  return { ok: ratio >= WCAG_AA_NORMAL_TEXT_RATIO, ratio };
}

export function meetsWcagAaNormalText(foregroundHex: string, backgroundHex: string): boolean {
  return evaluateWcagAaNormalText(foregroundHex, backgroundHex).ok;
}

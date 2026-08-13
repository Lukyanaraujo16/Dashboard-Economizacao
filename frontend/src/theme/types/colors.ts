export const COLOR_TOKEN_NAMES = [
  'background',
  'surface',
  'surfaceElevated',
  'primary',
  'onPrimary',
  'secondary',
  'accent',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'border',
  'success',
  'warning',
  'danger',
  'onDanger',
  'info',
  'focus',
  'disabled',
  'overlay',
  'shadow',
  'divider',
] as const;

export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];

export type ColorTokens = Readonly<Record<ColorTokenName, string>>;

/** Cores semânticas / estruturais — branding de tenant não as sobrescreve. */
export const PROTECTED_COLOR_TOKEN_NAMES = [
  'success',
  'warning',
  'danger',
  'onDanger',
  'info',
  'focus',
  'disabled',
] as const satisfies readonly ColorTokenName[];

export type ProtectedColorTokenName = (typeof PROTECTED_COLOR_TOKEN_NAMES)[number];

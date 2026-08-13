export const COLOR_TOKEN_NAMES = [
  'background',
  'surface',
  'surfaceElevated',
  'primary',
  'secondary',
  'accent',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'border',
  'success',
  'warning',
  'danger',
  'info',
  'focus',
  'disabled',
  'overlay',
  'shadow',
  'divider',
] as const;

export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];

export type ColorTokens = Readonly<Record<ColorTokenName, string>>;

/** Cores semânticas críticas — branding de tenant não as sobrescreve. */
export const PROTECTED_COLOR_TOKEN_NAMES = [
  'success',
  'warning',
  'danger',
  'info',
] as const satisfies readonly ColorTokenName[];

export type ProtectedColorTokenName = (typeof PROTECTED_COLOR_TOKEN_NAMES)[number];

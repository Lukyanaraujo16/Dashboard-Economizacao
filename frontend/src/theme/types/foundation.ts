export const SPACING_SCALE_KEYS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;

export type SpacingScaleKey = (typeof SPACING_SCALE_KEYS)[number];

export type SpacingTokens = Readonly<Record<SpacingScaleKey, string>>;

export const RADIUS_TOKEN_NAMES = ['sm', 'md', 'lg', 'xl', 'full'] as const;

export type RadiusTokenName = (typeof RADIUS_TOKEN_NAMES)[number];

export type RadiusTokens = Readonly<Record<RadiusTokenName, string>>;

export const ELEVATION_TOKEN_NAMES = ['none', 'sm', 'md', 'lg'] as const;

export type ElevationTokenName = (typeof ELEVATION_TOKEN_NAMES)[number];

export type ElevationTokens = Readonly<Record<ElevationTokenName, string>>;

export const DURATION_TOKEN_NAMES = ['instant', 'fast', 'normal', 'slow'] as const;

export type DurationTokenName = (typeof DURATION_TOKEN_NAMES)[number];

export type DurationTokens = Readonly<Record<DurationTokenName, string>>;

export const Z_INDEX_TOKEN_NAMES = [
  'base',
  'dropdown',
  'sticky',
  'overlay',
  'modal',
  'toast',
] as const;

export type ZIndexTokenName = (typeof Z_INDEX_TOKEN_NAMES)[number];

export type ZIndexTokens = Readonly<Record<ZIndexTokenName, string>>;

export const OPACITY_TOKEN_NAMES = ['disabled', 'muted', 'overlay'] as const;

export type OpacityTokenName = (typeof OPACITY_TOKEN_NAMES)[number];

export type OpacityTokens = Readonly<Record<OpacityTokenName, string>>;

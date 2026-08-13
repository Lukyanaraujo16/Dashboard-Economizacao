import type { ColorTokens } from './colors';
import type {
  DurationTokens,
  ElevationTokens,
  OpacityTokens,
  RadiusTokens,
  SpacingTokens,
  ZIndexTokens,
} from './foundation';

export type ThemeModePreference = 'light' | 'dark' | 'system';

export type ResolvedColorScheme = 'light' | 'dark';

export type ThemeFoundation = {
  readonly colors: ColorTokens;
  readonly spacing: SpacingTokens;
  readonly radius: RadiusTokens;
  readonly elevation: ElevationTokens;
  readonly duration: DurationTokens;
  readonly zIndex: ZIndexTokens;
  readonly opacity: OpacityTokens;
};

/**
 * Overrides futuros de branding por tenant.
 * Apenas tokens permitidos; semânticas críticas são ignoradas no resolver.
 */
export type TenantBrandingInput = {
  readonly logoUrl?: string | null;
  readonly light?: Partial<ColorTokens>;
  readonly dark?: Partial<ColorTokens>;
};

export type ResolveThemeInput = {
  readonly preference: ThemeModePreference;
  /** Preferência do ambiente quando preference === 'system'. */
  readonly systemScheme?: ResolvedColorScheme;
  readonly branding?: TenantBrandingInput | null;
};

export type ResolvedTheme = ThemeFoundation & {
  readonly colorScheme: ResolvedColorScheme;
  readonly preference: ThemeModePreference;
  /** null = usar logo padrão da plataforma na camada de UI futura. */
  readonly logoUrl: string | null;
};

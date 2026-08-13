'use client';

import { createContext } from 'react';

import type { ResolvedTheme, TenantBrandingInput, ThemeModePreference } from '../types/theme';

export type ThemeContextValue = {
  readonly theme: ResolvedTheme;
  readonly preference: ThemeModePreference;
  readonly branding: TenantBrandingInput | null;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

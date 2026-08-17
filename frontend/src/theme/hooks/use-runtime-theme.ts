'use client';

import { useContext } from 'react';

import {
  RuntimeThemeContext,
  type RuntimeThemeContextValue,
} from '../provider/runtime-theme-context';

export function useRuntimeTheme(): RuntimeThemeContextValue {
  const context = useContext(RuntimeThemeContext);
  if (!context) {
    throw new Error('useRuntimeTheme deve ser usado dentro de RuntimeThemeProvider.');
  }
  return context;
}

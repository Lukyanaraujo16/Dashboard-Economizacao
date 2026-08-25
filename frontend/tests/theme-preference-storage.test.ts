import { describe, expect, it } from 'vitest';

import {
  THEME_PREFERENCE_BOOTSTRAP_SCRIPT,
  THEME_PREFERENCE_STORAGE_KEY,
  parseThemePreference,
  readStoredThemePreference,
  writeStoredThemePreference,
} from '../src/theme/preference/theme-preference-storage';

describe('theme preference storage', () => {
  it('parse: valores oficiais e fallback system', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('neon')).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
  });

  it('ausência de chave não escreve e lê system', () => {
    localStorage.clear();
    expect(readStoredThemePreference()).toBe('system');
    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBeNull();
  });

  it('valor inválido persistido cai para system sem gravar usuário/tenant', () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'neon');
    expect(readStoredThemePreference()).toBe('system');
    expect(JSON.stringify(localStorage)).not.toMatch(/user|tenant|token|password/i);
  });

  it('grava somente a preferência namespaced', () => {
    writeStoredThemePreference('dark');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
    expect(localStorage.length).toBe(1);
    writeStoredThemePreference('light');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('light');
    writeStoredThemePreference('system');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('system');
  });

  it('bootstrap aplica dark persistido antes do React', () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    new Function(THEME_PREFERENCE_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('bootstrap com valor inválido usa system (light sem prefers-color-scheme)', () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'rainbow');
    document.documentElement.removeAttribute('data-theme');

    new Function(THEME_PREFERENCE_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

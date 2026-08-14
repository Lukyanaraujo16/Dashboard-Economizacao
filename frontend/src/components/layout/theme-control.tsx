'use client';

import { useTheme, type ThemeModePreference } from '../../theme';
import styles from './app-shell.module.css';

const OPTIONS: ReadonlyArray<{ readonly value: ThemeModePreference; readonly label: string }> = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.themeControl} role="group" aria-label="Tema da interface">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.themeOption}
          aria-pressed={preference === option.value}
          onClick={() => setPreference(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

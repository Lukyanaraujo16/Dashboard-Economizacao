'use client';

import type { KeyboardEvent, ReactElement } from 'react';

import { useTheme, type ThemeModePreference } from '../../theme';
import { IconMonitor, IconMoon, IconSun, type UiIconProps } from '../ui/icons';
import styles from './app-shell.module.css';

const OPTIONS: ReadonlyArray<{
  readonly value: ThemeModePreference;
  readonly ariaLabel: string;
  readonly Icon: (props?: UiIconProps) => ReactElement;
}> = [
  { value: 'light', ariaLabel: 'Tema claro', Icon: IconSun },
  { value: 'dark', ariaLabel: 'Tema escuro', Icon: IconMoon },
  { value: 'system', ariaLabel: 'Usar tema do sistema', Icon: IconMonitor },
];

export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp'
    ) {
      return;
    }

    event.preventDefault();
    const currentIndex = OPTIONS.findIndex((option) => option.value === preference);
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + OPTIONS.length) % OPTIONS.length;
    const next = OPTIONS[nextIndex];
    if (!next) {
      return;
    }
    setPreference(next.value);
    const buttons = event.currentTarget.querySelectorAll('button');
    buttons[nextIndex]?.focus();
  }

  return (
    <div
      className={styles.themeControl}
      role="group"
      aria-label="Tema da interface"
      onKeyDown={handleKeyDown}
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={styles.themeOption}
            title={option.ariaLabel}
            aria-label={option.ariaLabel}
            aria-pressed={selected}
            onClick={() => setPreference(option.value)}
          >
            <option.Icon className={styles.themeOptionIcon} size={15} />
          </button>
        );
      })}
    </div>
  );
}

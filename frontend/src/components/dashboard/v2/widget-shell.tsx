'use client';

import {
  useCallback,
  useId,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { Maximize2 } from 'lucide-react';

import { IconButton } from '../../ui';
import { UI_ICON_STROKE } from '../../ui/icons';
import { cx } from '../../ui/utils/cx';
import styles from './widget-shell.module.css';

export type WidgetShellProps = {
  /** `id` do elemento; também exposto como `data-v2-section`. */
  readonly id?: string;
  /** Âncora analítica do widget (`data-financial-section`). */
  readonly sectionId?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly expandable?: boolean;
  readonly onExpand?: () => void;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
};

/**
 * Card de widget com título interno.
 * Quando expansível, o card inteiro aciona `onExpand`; controles internos
 * marcados com `data-stop-expand` continuam independentes.
 */
export function WidgetShell({
  id,
  sectionId,
  title,
  subtitle,
  expandable = false,
  onExpand,
  footer,
  className,
  children,
}: WidgetShellProps) {
  const titleId = useId();
  const canExpand = expandable && Boolean(onExpand);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!canExpand) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('[data-stop-expand]')) {
        return;
      }
      onExpand?.();
    },
    [canExpand, onExpand],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!canExpand || event.target !== event.currentTarget) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onExpand?.();
      }
    },
    [canExpand, onExpand],
  );

  return (
    <article
      id={id}
      className={cx(styles.shell, canExpand && styles.clickable, className)}
      data-v2-section={id}
      data-financial-section={sectionId}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-labelledby={canExpand ? titleId : undefined}
      onClick={canExpand ? handleClick : undefined}
      onKeyDown={canExpand ? handleKeyDown : undefined}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {canExpand ? (
          <IconButton
            size="sm"
            variant="ghost"
            className={styles.expand}
            aria-label="Expandir"
            data-stop-expand
            onClick={(event) => {
              event.stopPropagation();
              onExpand?.();
            }}
          >
            <Maximize2 size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
          </IconButton>
        ) : null}
      </header>

      <div className={styles.body}>{children}</div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </article>
  );
}

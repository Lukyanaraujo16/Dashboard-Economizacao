'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { Button, FormField, Input } from '../../ui';
import { toRevenueGoalTargetDecimal } from './revenue-goal-math';
import { WidgetExpandDialog } from './widget-expand-dialog';
import styles from './revenue-goal-edit-dialog.module.css';

const INVALID_TARGET = 'Informe um valor maior que zero.';

export type RevenueGoalEditDialogProps = {
  readonly open: boolean;
  readonly monthLabel: string;
  /** Meta vigente em decimal-string; `null` quando ainda não configurada. */
  readonly currentTarget: string | null;
  readonly saving?: boolean;
  readonly error?: string | null;
  readonly onSubmit: (target: string) => void;
  readonly onClose: () => void;
};

/** Formulário de meta mensal. O valor trafega como decimal-string até a API. */
export function RevenueGoalEditDialog({
  open,
  monthLabel,
  currentTarget,
  saving = false,
  error = null,
  onSubmit,
  onClose,
}: RevenueGoalEditDialogProps) {
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTarget ?? '');
      setLocalError(null);
    }
  }, [currentTarget, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = toRevenueGoalTargetDecimal(value);
    if (target === null) {
      setLocalError(INVALID_TARGET);
      return;
    }
    setLocalError(null);
    onSubmit(target);
  };

  const preview = toRevenueGoalTargetDecimal(value);

  return (
    <WidgetExpandDialog
      open={open}
      title={currentTarget === null ? 'Definir meta de faturamento' : 'Editar meta de faturamento'}
      subtitle={`Competência de ${monthLabel}`}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormField
          label="Meta do mês"
          hint={preview === null ? 'Use apenas números, ex.: 180000,00' : formatMoneyBrl(preview)}
          error={localError ?? error}
          required
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="180000,00"
            value={value}
            disabled={saving}
            onChange={(event) => setValue(event.target.value)}
          />
        </FormField>

        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            Salvar meta
          </Button>
        </div>
      </form>
    </WidgetExpandDialog>
  );
}

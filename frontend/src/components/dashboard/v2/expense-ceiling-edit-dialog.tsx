'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { Button, FormField, Input } from '../../ui';
import { toRevenueGoalTargetDecimal } from './revenue-goal-math';
import { WidgetExpandDialog } from './widget-expand-dialog';
import styles from './revenue-goal-edit-dialog.module.css';

const INVALID_CEILING = 'Informe um valor maior que zero.';

export type ExpenseCeilingEditDialogProps = {
  readonly open: boolean;
  readonly monthLabel: string;
  readonly currentCeiling: string | null;
  readonly saving?: boolean;
  readonly error?: string | null;
  readonly onSubmit: (ceiling: string) => void;
  readonly onClose: () => void;
};

export function ExpenseCeilingEditDialog({
  open,
  monthLabel,
  currentCeiling,
  saving = false,
  error = null,
  onSubmit,
  onClose,
}: ExpenseCeilingEditDialogProps) {
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentCeiling ?? '');
      setLocalError(null);
    }
  }, [currentCeiling, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ceiling = toRevenueGoalTargetDecimal(value);
    if (ceiling === null) {
      setLocalError(INVALID_CEILING);
      return;
    }
    setLocalError(null);
    onSubmit(ceiling);
  };

  const preview = toRevenueGoalTargetDecimal(value);

  return (
    <WidgetExpandDialog
      open={open}
      title={currentCeiling === null ? 'Definir teto de gastos' : 'Editar teto de gastos'}
      subtitle={`Competência de ${monthLabel}`}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormField
          label="Teto do mês"
          hint={preview === null ? 'Use apenas números, ex.: 100000,00' : formatMoneyBrl(preview)}
          error={localError ?? error}
          required
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="100000,00"
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
            Salvar teto
          </Button>
        </div>
      </form>
    </WidgetExpandDialog>
  );
}

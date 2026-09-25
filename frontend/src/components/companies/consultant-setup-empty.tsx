import { MessageCircle } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { Button, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

type ConsultantSetupEmptyProps = {
  readonly onCreate: () => void;
};

const EMPTY_BENEFITS = [
  'Configuração rápida e guiada',
  'Você poderá revisar tudo antes de ativar',
  'Nada será ativado automaticamente',
] as const;

export function ConsultantSetupEmpty({ onCreate }: ConsultantSetupEmptyProps) {
  return (
    <div className={localStyles.experience}>
      <div
        className={cx(localStyles.experienceCard, localStyles.emptyState)}
        data-testid="consultant-empty-state"
      >
        <span className={localStyles.emptyIcon} aria-hidden="true">
          <MessageCircle size={22} strokeWidth={UI_ICON_STROKE} />
        </span>
        <div>
          <Typography as="h2" variant="heading">
            Crie o Consultor Financeiro desta empresa
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            Configure a identidade, o comportamento e o conhecimento que o Consultor usará para
            interpretar os dados financeiros.
          </Typography>
        </div>
        <ul className={localStyles.emptyBenefits}>
          {EMPTY_BENEFITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Button type="button" variant="primary" onClick={onCreate}>
          Criar Consultor
        </Button>
      </div>
    </div>
  );
}

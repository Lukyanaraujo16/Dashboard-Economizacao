import { MessageCircle } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { Button, Typography } from '../ui';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

type ConsultantSetupEmptyProps = {
  readonly onCreate: () => void;
};

export function ConsultantSetupEmpty({ onCreate }: ConsultantSetupEmptyProps) {
  return (
    <div className={localStyles.emptyState} data-testid="consultant-empty-state">
      <span className={localStyles.emptyIcon} aria-hidden="true">
        <MessageCircle size={22} strokeWidth={UI_ICON_STROKE} />
      </span>
      <div>
        <Typography as="h2" variant="heading">
          Crie o Consultor Financeiro desta empresa
        </Typography>
        <Typography as="p" variant="body" className={styles.pageDescription}>
          Configure a identidade, o comportamento e o conhecimento que o Consultor usará para
          interpretar os dados financeiros desta empresa.
        </Typography>
      </div>
      <Button type="button" variant="primary" onClick={onCreate}>
        Criar Consultor
      </Button>
    </div>
  );
}

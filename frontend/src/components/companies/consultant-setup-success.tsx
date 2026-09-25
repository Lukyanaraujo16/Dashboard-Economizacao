import { Check } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { Button, Typography } from '../ui';
import {
  consultantSuccessCopy,
  type ConsultantSuccessKind,
} from './consultant-setup-copy';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';
import { cx } from '../ui/utils/cx';

type ConsultantSetupSuccessProps = {
  readonly kind: ConsultantSuccessKind;
  readonly consultantName: string;
  readonly companyName: string;
  readonly onGoToConsultant: () => void;
  readonly onReview?: () => void;
};

export function ConsultantSetupSuccess({
  kind,
  consultantName,
  companyName,
  onGoToConsultant,
  onReview,
}: ConsultantSetupSuccessProps) {
  const copy = consultantSuccessCopy({ kind, consultantName, companyName });
  const showReview = Boolean(onReview) && (kind === 'created-active' || kind === 'edited-active');

  return (
    <div className={localStyles.experience}>
      <section
        className={cx(localStyles.experienceCard, localStyles.successCard, localStyles.successEnter)}
        data-testid="consultant-wizard-success"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={localStyles.successIcon} aria-hidden="true">
          <Check size={22} strokeWidth={UI_ICON_STROKE} />
        </span>
        <div>
          <Typography as="h2" variant="heading">
            {copy.title}
          </Typography>
          <Typography as="p" variant="body">
            {copy.message}
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            {copy.complement}
          </Typography>
        </div>
        <div className={localStyles.overviewActions}>
          <Button type="button" variant="primary" onClick={onGoToConsultant}>
            Ir para o Consultor
          </Button>
          {showReview && onReview ? (
            <Button type="button" variant="ghost" onClick={onReview}>
              Revisar configuração
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

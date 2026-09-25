import type { ConsultantKnowledgeEntry, ConsultantProviderStatus, ConsultantSettings } from '../../services/admin/consultant.types';
import { Badge, Button, Card, Typography } from '../ui';
import {
  emojiDisplayName,
  providerDisplayName,
  resolveDisplayedConsultantName,
  toneDisplayName,
  type ConsultantWizardStepId,
} from './consultant-setup-copy';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

type ConsultantManagementOverviewProps = {
  readonly companyName: string;
  readonly settings: ConsultantSettings;
  readonly knowledge: readonly ConsultantKnowledgeEntry[];
  readonly providerStatus: ConsultantProviderStatus | null;
  readonly saving: boolean;
  readonly formError: string | null;
  readonly successMessage: string | null;
  readonly onEdit: (step?: ConsultantWizardStepId) => void;
  readonly onToggleStatus: () => void;
};

export function ConsultantManagementOverview({
  companyName,
  settings,
  knowledge,
  providerStatus,
  saving,
  formError,
  successMessage,
  onEdit,
  onToggleStatus,
}: ConsultantManagementOverviewProps) {
  const consultantName = resolveDisplayedConsultantName(settings.consultantName);
  const activeKnowledge = knowledge.filter((entry) => entry.status === 'ACTIVE').length;
  const configured = settings.status !== 'NOT_CONFIGURED';
  const active = settings.status === 'ACTIVE';
  const instructionsConfigured = Boolean(settings.adminPrompt?.trim());
  const providerAvailable = providerStatus?.configured === true;

  return (
    <div className={localStyles.page} data-testid="consultant-overview">
      <section className={localStyles.overviewHero}>
        <div className={localStyles.overviewMeta}>
          <Typography as="h2" variant="heading">
            {consultantName}
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            Consultora financeira · {companyName}
          </Typography>
          <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Ativo' : 'Desativado'}</Badge>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            {toneDisplayName(settings.tonePreset)} · Emojis {emojiDisplayName(settings.emojiPreference).toLowerCase()}
            {' · '}
            {activeKnowledge} conhecimento{activeKnowledge === 1 ? '' : 's'} ativo{activeKnowledge === 1 ? '' : 's'}
          </Typography>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            {providerDisplayName(settings.provider)}
            {settings.model ? ` · ${settings.model}` : ''}
          </Typography>
        </div>
        <div className={localStyles.overviewActions}>
          <Button type="button" variant="secondary" onClick={() => onEdit()}>
            Editar configuração
          </Button>
          <Button type="button" variant="secondary" onClick={() => onEdit(5)}>
            Gerenciar conhecimentos
          </Button>
          {configured ? (
            <Button type="button" variant={active ? 'ghost' : 'primary'} loading={saving} onClick={onToggleStatus}>
              {active ? 'Desativar Consultor' : 'Ativar Consultor'}
            </Button>
          ) : null}
        </div>
      </section>

      {formError ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {formError}
        </Typography>
      ) : null}
      {successMessage ? (
        <Typography as="p" variant="body" className={styles.formSuccess} role="status">
          {successMessage}
        </Typography>
      ) : null}

      <div className={localStyles.cardGrid}>
        <Card className={localStyles.summaryCard} data-testid="overview-identity">
          <Typography as="h3" variant="label">
            Identidade
          </Typography>
          <Typography as="p" variant="body">
            {consultantName}
          </Typography>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            {settings.businessSegment?.trim() || 'Segmento não informado'}
          </Typography>
          <Button type="button" variant="ghost" onClick={() => onEdit(1)}>
            Editar
          </Button>
        </Card>

        <Card className={localStyles.summaryCard} data-testid="overview-behavior">
          <Typography as="h3" variant="label">
            Comportamento
          </Typography>
          <Typography as="p" variant="body">
            {toneDisplayName(settings.tonePreset)}
          </Typography>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            Emojis {emojiDisplayName(settings.emojiPreference).toLowerCase()}
          </Typography>
          <Button type="button" variant="ghost" onClick={() => onEdit(3)}>
            Editar
          </Button>
        </Card>

        <Card className={localStyles.summaryCard} data-testid="overview-instructions">
          <Typography as="h3" variant="label">
            Instruções
          </Typography>
          <Typography as="p" variant="body">
            {instructionsConfigured ? 'Configuradas' : 'Não configuradas'}
          </Typography>
          <Button type="button" variant="ghost" onClick={() => onEdit(4)}>
            Editar
          </Button>
        </Card>

        <Card className={localStyles.summaryCard} data-testid="overview-knowledge">
          <Typography as="h3" variant="label">
            Conhecimento
          </Typography>
          <Typography as="p" variant="body">
            {activeKnowledge} conhecimento{activeKnowledge === 1 ? '' : 's'} ativo{activeKnowledge === 1 ? '' : 's'}
          </Typography>
          <Button type="button" variant="ghost" onClick={() => onEdit(5)}>
            Gerenciar
          </Button>
        </Card>

        <Card className={localStyles.summaryCard} data-testid="overview-technology">
          <Typography as="h3" variant="label">
            Tecnologia
          </Typography>
          <Typography as="p" variant="body">
            {providerDisplayName(settings.provider)}
            {settings.model ? ` · ${settings.model}` : ''}
          </Typography>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            {providerAvailable ? 'Provider disponível' : 'Provider indisponível'}
          </Typography>
          <Button type="button" variant="ghost" onClick={() => onEdit(1)}>
            Editar
          </Button>
        </Card>
      </div>
    </div>
  );
}

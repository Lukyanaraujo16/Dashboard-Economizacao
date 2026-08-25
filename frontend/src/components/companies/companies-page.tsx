'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { isPlatformRole, useAuth } from '../../auth';
import {
  deleteCompany,
  disableCompany,
  listCompanies,
  reactivateCompany,
} from '../../services/admin/companies';
import { CompaniesRequestError, type Company } from '../../services/admin/companies.types';
import { enterSupportMode } from '../../services/auth/support';
import { useOptionalRuntimeTheme } from '../../theme';
import { EmptyState } from '../dashboard/empty-state';
import { PanelIcon } from '../financial/panel-icon';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, IconButton, Input, Spinner, Typography } from '../ui';
import {
  DeleteCompanyIcon,
  DisableCompanyIcon,
  EditCompanyIcon,
  ReactivateCompanyIcon,
  SupportCompanyIcon,
} from './company-action-icons';
import { CompanyContaAzulBadge } from './company-conta-azul-badge';
import { CompanyStatusBadge } from './company-status-badge';
import {
  COMPANY_STATUS_FILTER_OPTIONS,
  formatCompanyDate,
  formatLastSuccessfulSync,
  paginationRangeLabel,
  type CompanyStatusFilter,
} from './company-utils';
import styles from './companies.module.css';

const PAGE_SIZE = 10;

type PendingDisable = {
  readonly company: Company;
};

type PendingDelete = {
  readonly company: Company;
  readonly confirmText: string;
};

export function CompaniesPage() {
  const router = useRouter();
  const { user, support, refreshSession, applySession } = useAuth();
  const runtimeTheme = useOptionalRuntimeTheme();
  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>('ALL');
  const [offset, setOffset] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<PendingDisable | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setListState('loading');
    setListError(null);
    try {
      const result = await listCompanies({
        ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
        limit: PAGE_SIZE,
        offset,
      });
      setCompanies([...result.data]);
      setTotal(result.pagination.total);
      setHasMore(result.pagination.hasMore);
      setListState('ready');
    } catch (error) {
      if (error instanceof CompaniesRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setListState('error');
      setListError(
        error instanceof CompaniesRequestError
          ? error.message
          : 'Não foi possível carregar as empresas.',
      );
    }
  }, [offset, refreshSession, router, statusFilter]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  function handleFilterChange(next: CompanyStatusFilter) {
    setStatusFilter(next);
    setOffset(0);
    setPendingDisable(null);
    setPendingDelete(null);
    setActionError(null);
  }

  async function handleDisable(company: Company) {
    setActionLoadingId(company.id);
    setActionError(null);
    try {
      await disableCompany(company.id);
      setPendingDisable(null);
      await loadCompanies();
    } catch (error) {
      if (error instanceof CompaniesRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setActionError(
        error instanceof CompaniesRequestError
          ? error.message
          : 'Não foi possível desativar a empresa.',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReactivate(company: Company) {
    setActionLoadingId(company.id);
    setActionError(null);
    try {
      await reactivateCompany(company.id);
      await loadCompanies();
    } catch (error) {
      if (error instanceof CompaniesRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setActionError(
        error instanceof CompaniesRequestError
          ? error.message
          : 'Não foi possível reativar a empresa.',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(company: Company) {
    setActionLoadingId(company.id);
    setActionError(null);
    try {
      await deleteCompany(company.id);
      setPendingDelete(null);
      await loadCompanies();
    } catch (error) {
      if (error instanceof CompaniesRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setActionError(
        error instanceof CompaniesRequestError
          ? error.message
          : 'Não foi possível excluir a empresa.',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleEnterSupport(company: Company) {
    setActionLoadingId(company.id);
    setActionError(null);
    try {
      const session = await enterSupportMode(company.id);
      applySession(session);
      await runtimeTheme?.refreshBranding();
      router.replace('/');
    } catch {
      setActionError('Não foi possível acessar a empresa em modo suporte. Tente novamente.');
    } finally {
      setActionLoadingId(null);
    }
  }

  const isEmpty = listState === 'ready' && companies.length === 0;
  const canUseSupport = Boolean(user && isPlatformRole(user.role) && !support.active);

  return (
    <div className={styles.companiesPage}>
      <div className={styles.pageHeader}>
        <div className={styles.pageIntro}>
          <Typography as="h1" variant="heading">
            Empresas
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            Cadastre e gerencie as empresas da plataforma.
          </Typography>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterGroup} role="tablist" aria-label="Filtrar empresas por status">
          {COMPANY_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === option.value}
              data-active={statusFilter === option.value ? 'true' : 'false'}
              className={styles.filterButton}
              onClick={() => handleFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.pageHeaderActions}>
          <Button type="button" variant="primary" onClick={() => router.push('/empresas/nova')}>
            Nova empresa
          </Button>
        </div>
      </div>

      <div className={styles.listLead} aria-hidden="true" />

      {actionError ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {actionError}
        </Typography>
      ) : null}

      {pendingDisable ? (
        <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="disable-title">
          <Typography as="h3" variant="label" className={styles.confirmTitle} id="disable-title">
            Desativar {pendingDisable.company.displayName}?
          </Typography>
          <Typography as="p" variant="body" className={styles.confirmMessage}>
            Usuários vinculados a esta empresa perderão o acesso enquanto ela estiver desativada.
          </Typography>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={actionLoadingId === pendingDisable.company.id}
              onClick={() => void handleDisable(pendingDisable.company)}
            >
              Confirmar desativação
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={actionLoadingId === pendingDisable.company.id}
              onClick={() => setPendingDisable(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className={styles.dangerPanel}
          role="alertdialog"
          aria-labelledby="delete-title"
          aria-describedby="delete-description"
        >
          <Typography as="h3" variant="label" className={styles.dangerTitle} id="delete-title">
            Excluir permanentemente {pendingDelete.company.displayName}?
          </Typography>
          <Typography
            as="p"
            variant="body"
            className={styles.dangerMessage}
            id="delete-description"
          >
            Esta ação é permanente e não pode ser desfeita.
          </Typography>
          <Typography as="p" variant="caption" className={styles.dangerHint}>
            Digite &quot;{pendingDelete.company.name}&quot; para confirmar.
          </Typography>
          <FormFieldLike label="Confirmação" htmlFor="delete-confirm">
            <Input
              id="delete-confirm"
              value={pendingDelete.confirmText}
              autoComplete="off"
              onChange={(event) =>
                setPendingDelete({
                  company: pendingDelete.company,
                  confirmText: event.target.value,
                })
              }
            />
          </FormFieldLike>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={actionLoadingId === pendingDelete.company.id}
              disabled={pendingDelete.confirmText !== pendingDelete.company.name}
              onClick={() => void handleDelete(pendingDelete.company)}
            >
              Excluir permanentemente
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={actionLoadingId === pendingDelete.company.id}
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {listState === 'loading' ? (
        <div className={styles.loadingState}>
          <Spinner size="md" label="Carregando empresas" />
        </div>
      ) : null}

      {listState === 'error' ? (
        <StateWrapper
          state="error"
          errorMessage={listError ?? undefined}
          onRetry={() => void loadCompanies()}
        />
      ) : null}

      {isEmpty ? (
        <EmptyState
          description="Nenhuma empresa cadastrada."
          align="center"
          icon={<PanelIcon kind="list" />}
        >
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => router.push('/empresas/nova')}
          >
            Cadastrar primeira empresa
          </Button>
        </EmptyState>
      ) : null}

      {listState === 'ready' && companies.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="Empresas cadastradas">
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Identificador</th>
                  <th scope="col">Status</th>
                  <th scope="col">Conta Azul</th>
                  <th scope="col">Última sincronização</th>
                  <th scope="col">Atualizada em</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td className={styles.companyName}>{company.displayName}</td>
                    <td className={styles.identifier}>{company.name}</td>
                    <td>
                      <CompanyStatusBadge status={company.status} />
                    </td>
                    <td>
                      <CompanyContaAzulBadge status={company.integration?.status ?? null} />
                    </td>
                    <td>{formatLastSuccessfulSync(company.integration?.lastSuccessfulSyncAt)}</td>
                    <td>{formatCompanyDate(company.updatedAt)}</td>
                    <td>
                      <CompanyRowActions
                        company={company}
                        layout="desktop"
                        actionLoadingId={actionLoadingId}
                        canEnterSupport={canUseSupport && company.status === 'ACTIVE'}
                        onEnterSupport={() => void handleEnterSupport(company)}
                        onDisable={() => {
                          setPendingDelete(null);
                          setPendingDisable({ company });
                        }}
                        onReactivate={() => void handleReactivate(company)}
                        onDelete={() => {
                          setPendingDisable(null);
                          setPendingDelete({ company, confirmText: '' });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList} aria-label="Lista de empresas">
            {companies.map((company) => (
              <article key={company.id} className={styles.companyCard}>
                <div className={styles.cardHeader}>
                  <Typography as="h3" variant="label" className={styles.companyName}>
                    {company.displayName}
                  </Typography>
                  <CompanyStatusBadge status={company.status} />
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Identificador
                  </Typography>
                  <Typography as="p" variant="body" className={styles.cardValue}>
                    {company.name}
                  </Typography>
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Conta Azul
                  </Typography>
                  <div className={styles.cardValue}>
                    <CompanyContaAzulBadge status={company.integration?.status ?? null} />
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Última sincronização
                  </Typography>
                  <Typography as="p" variant="body" className={styles.cardValue}>
                    {formatLastSuccessfulSync(company.integration?.lastSuccessfulSyncAt)}
                  </Typography>
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Atualizada em
                  </Typography>
                  <Typography as="p" variant="body" className={styles.cardValue}>
                    {formatCompanyDate(company.updatedAt)}
                  </Typography>
                </div>
                <CompanyRowActions
                  company={company}
                  layout="mobile"
                  actionLoadingId={actionLoadingId}
                  canEnterSupport={canUseSupport && company.status === 'ACTIVE'}
                  onEnterSupport={() => void handleEnterSupport(company)}
                  onDisable={() => {
                    setPendingDelete(null);
                    setPendingDisable({ company });
                  }}
                  onReactivate={() => void handleReactivate(company)}
                  onDelete={() => {
                    setPendingDisable(null);
                    setPendingDelete({ company, confirmText: '' });
                  }}
                />
              </article>
            ))}
          </div>

          <div className={styles.pagination}>
            <Typography as="p" variant="caption" className={styles.paginationInfo}>
              {paginationRangeLabel(offset, companies.length, total)}
            </Typography>
            <div className={styles.paginationActions}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={offset === 0 || listState !== 'ready'}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasMore || listState !== 'ready'}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

type CompanyRowActionsProps = {
  readonly company: Company;
  readonly layout: 'desktop' | 'mobile';
  readonly actionLoadingId: string | null;
  readonly canEnterSupport: boolean;
  readonly onEnterSupport: () => void;
  readonly onDisable: () => void;
  readonly onReactivate: () => void;
  readonly onDelete: () => void;
};

function CompanyRowActions({
  company,
  layout,
  actionLoadingId,
  canEnterSupport,
  onEnterSupport,
  onDisable,
  onReactivate,
  onDelete,
}: CompanyRowActionsProps) {
  const router = useRouter();
  const isLoading = actionLoadingId === company.id;

  if (layout === 'mobile') {
    return (
      <div className={styles.actionsMobile}>
        {canEnterSupport ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={isLoading}
            className={styles.actionToneInfo}
            onClick={onEnterSupport}
          >
            <SupportCompanyIcon />
            <span>Acessar em modo suporte</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.actionToneNeutral}
          onClick={() => router.push(`/empresas/${company.id}/editar`)}
        >
          <EditCompanyIcon />
          <span>Editar</span>
        </Button>
        {company.status === 'ACTIVE' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={isLoading}
            className={styles.actionToneDanger}
            onClick={onDisable}
          >
            <DisableCompanyIcon />
            <span>Desativar</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={isLoading}
            className={styles.actionToneSuccess}
            onClick={onReactivate}
          >
            <ReactivateCompanyIcon />
            <span>Reativar</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.actionToneDanger}
          onClick={onDelete}
        >
          <DeleteCompanyIcon />
          <span>Excluir</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.actionsDesktop}>
      {canEnterSupport ? (
        <IconButton
          type="button"
          variant="ghost"
          tone="neutral"
          size="sm"
          aria-label={`Acessar ${company.displayName} em modo suporte`}
          title="Acessar em modo suporte"
          loading={isLoading}
          onClick={onEnterSupport}
        >
          <SupportCompanyIcon />
        </IconButton>
      ) : null}
      <IconButton
        type="button"
        variant="ghost"
        tone="neutral"
        size="sm"
        aria-label={`Editar ${company.displayName}`}
        title="Editar"
        onClick={() => router.push(`/empresas/${company.id}/editar`)}
      >
        <EditCompanyIcon />
      </IconButton>
      {company.status === 'ACTIVE' ? (
        <IconButton
          type="button"
          variant="ghost"
          tone="danger"
          size="sm"
          aria-label={`Desativar ${company.displayName}`}
          title="Desativar"
          loading={isLoading}
          onClick={onDisable}
        >
          <DisableCompanyIcon />
        </IconButton>
      ) : (
        <IconButton
          type="button"
          variant="ghost"
          tone="success"
          size="sm"
          aria-label={`Reativar ${company.displayName}`}
          title="Reativar"
          loading={isLoading}
          onClick={onReactivate}
        >
          <ReactivateCompanyIcon />
        </IconButton>
      )}
      <IconButton
        type="button"
        variant="ghost"
        tone="danger"
        size="sm"
        aria-label={`Excluir permanentemente ${company.displayName}`}
        title="Excluir permanentemente"
        onClick={onDelete}
      >
        <DeleteCompanyIcon />
      </IconButton>
    </div>
  );
}

type FormFieldLikeProps = {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: ReactNode;
};

function FormFieldLike({ label, htmlFor, children }: FormFieldLikeProps) {
  return (
    <div className={styles.inlineField}>
      <label className={styles.inlineFieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

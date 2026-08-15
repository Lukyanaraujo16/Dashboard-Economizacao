'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../auth';
import type { ManagedUser } from '../../services/admin/managed-user.types';
import { ManagedUsersRequestError } from '../../services/admin/managed-user.types';
import { EmptyState } from '../dashboard/empty-state';
import { PanelIcon } from '../financial/panel-icon';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, FormField, IconButton, PasswordInput, Spinner, Typography } from '../ui';
import styles from '../companies/companies.module.css';
import {
  BlockManagedUserIcon,
  DisableManagedUserIcon,
  EditManagedUserIcon,
  EnableManagedUserIcon,
  ResetPasswordManagedUserIcon,
  UnblockManagedUserIcon,
} from './managed-user-action-icons';
import { ManagedUserStatusBadge } from './managed-user-status-badge';
import {
  formatManagedUserDate,
  MANAGED_USER_STATUS_FILTER_OPTIONS,
  mapManagedUserValidationDetails,
  paginationRangeLabel,
  validateResetPasswordFields,
  type ManagedUserStatusFilter,
  type ResetPasswordFieldErrors,
} from './managed-user-utils';

const PAGE_SIZE = 10;

export type ManagedUsersListApi = {
  readonly list: (params: {
    readonly status?: Exclude<ManagedUserStatusFilter, 'ALL'>;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<{
    readonly data: ReadonlyArray<ManagedUser>;
    readonly pagination: {
      readonly total: number;
      readonly hasMore: boolean;
    };
  }>;
  readonly block: (userId: string) => Promise<ManagedUser>;
  readonly unblock: (userId: string) => Promise<ManagedUser>;
  readonly disable: (userId: string) => Promise<ManagedUser>;
  readonly enable: (userId: string) => Promise<ManagedUser>;
  readonly resetPassword: (
    userId: string,
    input: { readonly password: string; readonly passwordConfirmation: string },
  ) => Promise<ManagedUser>;
};

export type ManagedUsersListPageProps = {
  readonly title: string;
  readonly description: string;
  readonly createLabel: string;
  readonly emptyCtaLabel: string;
  readonly createHref: string;
  readonly editHref: (userId: string) => string;
  readonly emptyDescription: string;
  readonly tableAriaLabel: string;
  readonly filterAriaLabel: string;
  readonly loadingLabel: string;
  readonly api: ManagedUsersListApi;
};

type PendingAction = {
  readonly kind: 'block' | 'disable';
  readonly user: ManagedUser;
};

export function ManagedUsersListPage({
  title,
  description,
  createLabel,
  emptyCtaLabel,
  createHref,
  editHref,
  emptyDescription,
  tableAriaLabel,
  filterAriaLabel,
  loadingLabel,
  api,
}: ManagedUsersListPageProps) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ManagedUserStatusFilter>('ALL');
  const [offset, setOffset] = useState(0);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingResetUser, setPendingResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
  const [resetFieldErrors, setResetFieldErrors] = useState<ResetPasswordFieldErrors>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setListState('loading');
    setListError(null);
    try {
      const result = await api.list({
        ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
        limit: PAGE_SIZE,
        offset,
      });
      setUsers([...result.data]);
      setTotal(result.pagination.total);
      setHasMore(result.pagination.hasMore);
      setListState('ready');
    } catch (error) {
      if (error instanceof ManagedUsersRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setListState('error');
      setListError(
        error instanceof ManagedUsersRequestError
          ? error.message
          : 'Não foi possível carregar os registros.',
      );
    }
  }, [api, offset, refreshSession, router, statusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function handleFilterChange(next: ManagedUserStatusFilter) {
    setStatusFilter(next);
    setOffset(0);
    setPendingAction(null);
    setPendingResetUser(null);
    setActionError(null);
    setActionSuccess(null);
  }

  function openResetPassword(user: ManagedUser) {
    setPendingAction(null);
    setPendingResetUser(user);
    setResetPassword('');
    setResetPasswordConfirmation('');
    setResetFieldErrors({});
    setActionError(null);
    setActionSuccess(null);
  }

  async function handleResetPassword() {
    if (!pendingResetUser) return;
    const validation = validateResetPasswordFields({
      password: resetPassword,
      passwordConfirmation: resetPasswordConfirmation,
    });
    if (Object.keys(validation).length > 0) {
      setResetFieldErrors(validation);
      return;
    }

    setActionLoadingId(pendingResetUser.id);
    setActionError(null);
    setActionSuccess(null);
    setResetFieldErrors({});
    try {
      await api.resetPassword(pendingResetUser.id, {
        password: resetPassword,
        passwordConfirmation: resetPasswordConfirmation,
      });
      setPendingResetUser(null);
      setResetPassword('');
      setResetPasswordConfirmation('');
      setActionSuccess(`Senha de ${pendingResetUser.name} redefinida com sucesso.`);
    } catch (error) {
      if (error instanceof ManagedUsersRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      if (
        error instanceof ManagedUsersRequestError &&
        (error.kind === 'validation' || error.kind === 'bad_request' || error.kind === 'conflict')
      ) {
        const mapped = mapManagedUserValidationDetails(error.details);
        setResetFieldErrors({
          password: mapped.password,
          passwordConfirmation: error.details?.some(
            (detail) => detail.field === 'passwordConfirmation',
          )
            ? mapped.password
            : undefined,
        });
        setActionError(error.message);
        return;
      }
      setActionError(
        error instanceof ManagedUsersRequestError
          ? error.message
          : 'Não foi possível redefinir a senha.',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function runAction(
    user: ManagedUser,
    action: (userId: string) => Promise<ManagedUser>,
    fallbackMessage: string,
  ) {
    setActionLoadingId(user.id);
    setActionError(null);
    try {
      await action(user.id);
      setPendingAction(null);
      await loadUsers();
    } catch (error) {
      if (error instanceof ManagedUsersRequestError && error.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }
      setActionError(error instanceof ManagedUsersRequestError ? error.message : fallbackMessage);
    } finally {
      setActionLoadingId(null);
    }
  }

  const isEmpty = listState === 'ready' && users.length === 0;

  return (
    <div className={styles.companiesPage}>
      <div className={styles.pageHeader}>
        <div className={styles.pageIntro}>
          <Typography as="h2" variant="heading">
            {title}
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            {description}
          </Typography>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterGroup} role="tablist" aria-label={filterAriaLabel}>
          {MANAGED_USER_STATUS_FILTER_OPTIONS.map((option) => (
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
          <Button type="button" variant="primary" onClick={() => router.push(createHref)}>
            {createLabel}
          </Button>
        </div>
      </div>

      <div className={styles.listLead} aria-hidden="true" />

      {actionError ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {actionError}
        </Typography>
      ) : null}

      {actionSuccess ? (
        <Typography as="p" variant="body" className={styles.formSuccess} role="status">
          {actionSuccess}
        </Typography>
      ) : null}

      {pendingResetUser ? (
        <div
          className={styles.confirmPanel}
          role="alertdialog"
          aria-labelledby="reset-password-title"
        >
          <Typography
            as="h3"
            variant="label"
            className={styles.confirmTitle}
            id="reset-password-title"
          >
            Redefinir senha de {pendingResetUser.name}
          </Typography>
          <Typography as="p" variant="body" className={styles.confirmMessage}>
            A nova senha substitui a atual. Sessões ativas deste usuário serão encerradas.
          </Typography>
          <FormField label="Nova senha" htmlFor="reset-password" error={resetFieldErrors.password}>
            <PasswordInput
              id="reset-password"
              name="password"
              value={resetPassword}
              autoComplete="new-password"
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </FormField>
          <FormField
            label="Confirmar senha"
            htmlFor="reset-password-confirmation"
            error={resetFieldErrors.passwordConfirmation}
          >
            <PasswordInput
              id="reset-password-confirmation"
              name="passwordConfirmation"
              value={resetPasswordConfirmation}
              autoComplete="new-password"
              onChange={(event) => setResetPasswordConfirmation(event.target.value)}
            />
          </FormField>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={actionLoadingId === pendingResetUser.id}
              onClick={() => void handleResetPassword()}
            >
              Redefinir senha
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={actionLoadingId === pendingResetUser.id}
              onClick={() => {
                setPendingResetUser(null);
                setResetFieldErrors({});
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {pendingAction ? (
        <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="user-action-title">
          <Typography
            as="h3"
            variant="label"
            className={styles.confirmTitle}
            id="user-action-title"
          >
            {pendingAction.kind === 'block'
              ? `Bloquear ${pendingAction.user.name}?`
              : `Desativar ${pendingAction.user.name}?`}
          </Typography>
          <Typography as="p" variant="body" className={styles.confirmMessage}>
            {pendingAction.kind === 'block'
              ? 'O acesso será suspenso até o desbloqueio.'
              : 'O acesso será encerrado até a reativação.'}
          </Typography>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={actionLoadingId === pendingAction.user.id}
              onClick={() =>
                void runAction(
                  pendingAction.user,
                  pendingAction.kind === 'block' ? api.block : api.disable,
                  pendingAction.kind === 'block'
                    ? 'Não foi possível bloquear o registro.'
                    : 'Não foi possível desativar o registro.',
                )
              }
            >
              {pendingAction.kind === 'block' ? 'Confirmar bloqueio' : 'Confirmar desativação'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={actionLoadingId === pendingAction.user.id}
              onClick={() => setPendingAction(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {listState === 'loading' ? (
        <div className={styles.loadingState}>
          <Spinner size="md" label={loadingLabel} />
        </div>
      ) : null}

      {listState === 'error' ? (
        <StateWrapper
          state="error"
          errorMessage={listError ?? undefined}
          onRetry={() => void loadUsers()}
        />
      ) : null}

      {isEmpty ? (
        <EmptyState description={emptyDescription} align="center" icon={<PanelIcon kind="list" />}>
          <Button type="button" variant="primary" size="sm" onClick={() => router.push(createHref)}>
            {emptyCtaLabel}
          </Button>
        </EmptyState>
      ) : null}

      {listState === 'ready' && users.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label={tableAriaLabel}>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Atualizado em</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className={styles.companyName}>{user.name}</td>
                    <td className={styles.emailCell}>{user.email}</td>
                    <td>
                      <ManagedUserStatusBadge status={user.status} />
                    </td>
                    <td>{formatManagedUserDate(user.updatedAt)}</td>
                    <td>
                      <ManagedUserRowActions
                        user={user}
                        layout="desktop"
                        editHref={editHref(user.id)}
                        actionLoadingId={actionLoadingId}
                        onBlock={() => setPendingAction({ kind: 'block', user })}
                        onUnblock={() =>
                          void runAction(user, api.unblock, 'Não foi possível desbloquear.')
                        }
                        onDisable={() => setPendingAction({ kind: 'disable', user })}
                        onEnable={() =>
                          void runAction(user, api.enable, 'Não foi possível ativar.')
                        }
                        onResetPassword={() => openResetPassword(user)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList} aria-label={tableAriaLabel}>
            {users.map((user) => (
              <article key={user.id} className={styles.companyCard}>
                <div className={styles.cardHeader}>
                  <Typography as="h3" variant="label" className={styles.companyName}>
                    {user.name}
                  </Typography>
                  <ManagedUserStatusBadge status={user.status} />
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Email
                  </Typography>
                  <Typography as="p" variant="body" className={styles.emailCell}>
                    {user.email}
                  </Typography>
                </div>
                <div className={styles.cardMeta}>
                  <Typography as="p" variant="caption" className={styles.cardLabel}>
                    Atualizado em
                  </Typography>
                  <Typography as="p" variant="body" className={styles.cardValue}>
                    {formatManagedUserDate(user.updatedAt)}
                  </Typography>
                </div>
                <ManagedUserRowActions
                  user={user}
                  layout="mobile"
                  editHref={editHref(user.id)}
                  actionLoadingId={actionLoadingId}
                  onBlock={() => setPendingAction({ kind: 'block', user })}
                  onUnblock={() =>
                    void runAction(user, api.unblock, 'Não foi possível desbloquear.')
                  }
                  onDisable={() => setPendingAction({ kind: 'disable', user })}
                  onEnable={() => void runAction(user, api.enable, 'Não foi possível ativar.')}
                  onResetPassword={() => openResetPassword(user)}
                />
              </article>
            ))}
          </div>

          <div className={styles.pagination}>
            <Typography as="p" variant="caption" className={styles.paginationInfo}>
              {paginationRangeLabel(offset, users.length, total)}
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

type ManagedUserRowActionsProps = {
  readonly user: ManagedUser;
  readonly layout: 'desktop' | 'mobile';
  readonly editHref: string;
  readonly actionLoadingId: string | null;
  readonly onBlock: () => void;
  readonly onUnblock: () => void;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
  readonly onResetPassword: () => void;
};

function ManagedUserRowActions({
  user,
  layout,
  editHref,
  actionLoadingId,
  onBlock,
  onUnblock,
  onDisable,
  onEnable,
  onResetPassword,
}: ManagedUserRowActionsProps) {
  const router = useRouter();
  const isLoading = actionLoadingId === user.id;
  const canBlock = user.status === 'ACTIVE' || user.status === 'PENDING';
  const canUnblock = user.status === 'BLOCKED';
  const canDisable = user.status !== 'DISABLED';
  const canEnable = user.status === 'DISABLED';

  if (layout === 'mobile') {
    return (
      <div className={styles.actionsMobile}>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push(editHref)}>
          <EditManagedUserIcon />
          <span>Editar</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onResetPassword}>
          <ResetPasswordManagedUserIcon />
          <span>Redefinir senha</span>
        </Button>
        {canBlock ? (
          <Button type="button" variant="danger" size="sm" loading={isLoading} onClick={onBlock}>
            <BlockManagedUserIcon />
            <span>Bloquear</span>
          </Button>
        ) : null}
        {canUnblock ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isLoading}
            onClick={onUnblock}
          >
            <UnblockManagedUserIcon />
            <span>Desbloquear</span>
          </Button>
        ) : null}
        {canDisable ? (
          <Button type="button" variant="danger" size="sm" loading={isLoading} onClick={onDisable}>
            <DisableManagedUserIcon />
            <span>Desativar</span>
          </Button>
        ) : null}
        {canEnable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isLoading}
            onClick={onEnable}
          >
            <EnableManagedUserIcon />
            <span>Ativar</span>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.actionsDesktop}>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Editar ${user.name}`}
        title="Editar"
        onClick={() => router.push(editHref)}
      >
        <EditManagedUserIcon />
      </IconButton>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Redefinir senha de ${user.name}`}
        title="Redefinir senha"
        onClick={onResetPassword}
      >
        <ResetPasswordManagedUserIcon />
      </IconButton>
      {canBlock ? (
        <IconButton
          type="button"
          variant="danger"
          size="sm"
          aria-label={`Bloquear ${user.name}`}
          title="Bloquear"
          loading={isLoading}
          onClick={onBlock}
        >
          <BlockManagedUserIcon />
        </IconButton>
      ) : null}
      {canUnblock ? (
        <IconButton
          type="button"
          variant="secondary"
          size="sm"
          aria-label={`Desbloquear ${user.name}`}
          title="Desbloquear"
          loading={isLoading}
          onClick={onUnblock}
        >
          <UnblockManagedUserIcon />
        </IconButton>
      ) : null}
      {canDisable ? (
        <IconButton
          type="button"
          variant="danger"
          size="sm"
          aria-label={`Desativar ${user.name}`}
          title="Desativar"
          loading={isLoading}
          onClick={onDisable}
        >
          <DisableManagedUserIcon />
        </IconButton>
      ) : null}
      {canEnable ? (
        <IconButton
          type="button"
          variant="secondary"
          size="sm"
          aria-label={`Ativar ${user.name}`}
          title="Ativar"
          loading={isLoading}
          onClick={onEnable}
        >
          <EnableManagedUserIcon />
        </IconButton>
      ) : null}
    </div>
  );
}

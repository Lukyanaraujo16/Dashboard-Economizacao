'use client';

import { useEffect, useMemo, useState } from 'react';

import { getCompany } from '../../services/admin/companies';
import {
  blockTenantUser,
  createTenantUser,
  disableTenantUser,
  enableTenantUser,
  getTenantUser,
  listTenantUsers,
  resetTenantUserPassword,
  unblockTenantUser,
  updateTenantUser,
} from '../../services/admin/tenant-users';
import { CompanySectionNav } from '../companies/company-section-nav';
import { ManagedUserFormPage } from '../managed-users/managed-user-form-page';
import { ManagedUsersListPage } from '../managed-users/managed-users-list-page';

type CompanyUsersPageProps = {
  readonly companyId: string;
};

export function CompanyUsersPage({ companyId }: CompanyUsersPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCompany(companyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company.displayName);
      })
      .catch(() => {
        if (!cancelled) setCompanyName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const api = useMemo(
    () => ({
      list: (params: {
        readonly status?: 'ACTIVE' | 'BLOCKED' | 'DISABLED';
        readonly limit: number;
        readonly offset: number;
      }) => listTenantUsers(companyId, params),
      block: (userId: string) => blockTenantUser(companyId, userId),
      unblock: (userId: string) => unblockTenantUser(companyId, userId),
      disable: (userId: string) => disableTenantUser(companyId, userId),
      enable: (userId: string) => enableTenantUser(companyId, userId),
      resetPassword: (
        userId: string,
        input: { readonly password: string; readonly passwordConfirmation: string },
      ) => resetTenantUserPassword(companyId, userId, input),
    }),
    [companyId],
  );

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      <ManagedUsersListPage
        title="Usuários"
        description="Cadastre e gerencie os usuários desta empresa."
        createLabel="Novo usuário"
        emptyCtaLabel="Cadastrar primeiro usuário"
        createHref={`/empresas/${companyId}/usuarios/novo`}
        editHref={(userId) => `/empresas/${companyId}/usuarios/${userId}/editar`}
        emptyDescription="Nenhum usuário cadastrado."
        tableAriaLabel="Usuários da empresa"
        filterAriaLabel="Filtrar usuários por status"
        loadingLabel="Carregando usuários"
        titleHeadingLevel={2}
        api={api}
      />
    </CompanySectionNav>
  );
}

type CompanyUserFormPageProps = {
  readonly mode: 'create' | 'edit';
  readonly companyId: string;
  readonly userId?: string;
};

export function CompanyUserFormPage({ mode, companyId, userId }: CompanyUserFormPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCompany(companyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company.displayName);
      })
      .catch(() => {
        if (!cancelled) setCompanyName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const api = useMemo(
    () => ({
      getById: (id: string) => getTenantUser(companyId, id),
      create: (input: { name: string; email: string; password: string }) =>
        createTenantUser(companyId, input),
      update: (id: string, input: { name?: string; email?: string }) =>
        updateTenantUser(companyId, id, input),
    }),
    [companyId],
  );

  const listHref = `/empresas/${companyId}/usuarios`;

  return (
    <ManagedUserFormPage
      mode={mode}
      userId={userId}
      title={mode === 'create' ? 'Novo usuário' : 'Editar usuário'}
      description={
        mode === 'create'
          ? 'Cadastre um novo usuário para esta empresa.'
          : 'Atualize os dados do usuário.'
      }
      notFoundMessage="Usuário não encontrado."
      loadErrorMessage="Não foi possível carregar o usuário."
      cancelHref={listHref}
      successHref={listHref}
      submitLabel={mode === 'create' ? 'Cadastrar usuário' : 'Salvar alterações'}
      api={api}
      wrap={(content) => (
        <CompanySectionNav companyId={companyId} companyName={companyName}>
          {content}
        </CompanySectionNav>
      )}
    />
  );
}

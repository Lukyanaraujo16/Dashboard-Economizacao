import { CompanyUsersPage } from '../../../../../src/components/company-users';

type UsuariosEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function UsuariosEmpresaPage({ params }: UsuariosEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyUsersPage companyId={companyId} />;
}

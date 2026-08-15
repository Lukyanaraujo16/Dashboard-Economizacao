import { CompanyUserFormPage } from '../../../../../../src/components/company-users';

type NovoUsuarioEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function NovoUsuarioEmpresaPage({ params }: NovoUsuarioEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyUserFormPage mode="create" companyId={companyId} />;
}

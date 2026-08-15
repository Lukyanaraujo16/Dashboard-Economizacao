import { CompanyUserFormPage } from '../../../../../../../src/components/company-users';

type EditarUsuarioEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string; readonly userId: string }>;
};

export default async function EditarUsuarioEmpresaPage({ params }: EditarUsuarioEmpresaPageProps) {
  const { companyId, userId } = await params;
  return <CompanyUserFormPage mode="edit" companyId={companyId} userId={userId} />;
}

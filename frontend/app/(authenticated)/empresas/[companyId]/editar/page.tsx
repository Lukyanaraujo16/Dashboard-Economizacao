import { CompanyFormPage } from '../../../../../src/components/companies';

/**
 * Edição pontual da empresa. Futuro hub por seções (sem abas vazias nesta fase):
 * /empresas/:companyId, /empresas/:companyId/geral, /branding, /usuarios, /integracoes...
 */
type EditarEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function EditarEmpresaPage({ params }: EditarEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyFormPage mode="edit" companyId={companyId} />;
}

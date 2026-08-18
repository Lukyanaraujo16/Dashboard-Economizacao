import { CompanyIntegrationsPage } from '../../../../../src/components/companies/company-integrations-page';

type IntegracoesEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
  readonly searchParams: Promise<{ readonly contaAzul?: string }>;
};

export default async function IntegracoesEmpresaPage({
  params,
  searchParams,
}: IntegracoesEmpresaPageProps) {
  const { companyId } = await params;
  const query = await searchParams;
  return <CompanyIntegrationsPage companyId={companyId} oauthResult={query.contaAzul ?? null} />;
}

import { CompanyConsultantPage } from '../../../../../src/components/companies';

type ConsultorEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function ConsultorEmpresaPage({ params }: ConsultorEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyConsultantPage companyId={companyId} />;
}

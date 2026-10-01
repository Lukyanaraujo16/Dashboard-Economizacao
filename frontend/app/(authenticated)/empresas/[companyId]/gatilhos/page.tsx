import { CompanyProactiveTriggersPage } from '../../../../../src/components/companies';

type GatilhosEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function GatilhosEmpresaPage({ params }: GatilhosEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyProactiveTriggersPage companyId={companyId} />;
}

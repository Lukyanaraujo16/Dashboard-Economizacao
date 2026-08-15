import { CompanyAppearancePage } from '../../../../../src/components/companies';

/**
 * Aparência da empresa — hub interno (Geral | Aparência).
 */
type AparenciaEmpresaPageProps = {
  readonly params: Promise<{ readonly companyId: string }>;
};

export default async function AparenciaEmpresaPage({ params }: AparenciaEmpresaPageProps) {
  const { companyId } = await params;
  return <CompanyAppearancePage companyId={companyId} />;
}

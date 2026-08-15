import { AdministratorFormPage } from '../../../../../src/components/administrators';

type EditarAdministradorPageProps = {
  readonly params: Promise<{ readonly userId: string }>;
};

export default async function EditarAdministradorPage({ params }: EditarAdministradorPageProps) {
  const { userId } = await params;
  return <AdministratorFormPage mode="edit" userId={userId} />;
}

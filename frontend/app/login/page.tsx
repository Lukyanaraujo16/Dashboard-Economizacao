import { LoginExperience } from '../../src/login/login-experience';

/**
 * Rota de produção do login.
 * Experiência visual congelada (ADR-044) + integração funcional 1.1F-E.2.
 */
export default function LoginPage() {
  return <LoginExperience />;
}

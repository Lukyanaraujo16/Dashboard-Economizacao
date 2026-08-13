/** Validação client-side mínima alinhada ao schema HTTP de login. */

export const LOGIN_PASSWORD_MIN_LENGTH = 10;
export const LOGIN_PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginFieldErrors = {
  readonly email?: string;
  readonly password?: string;
};

export function validateLoginFields(input: {
  readonly email: string;
  readonly password: string;
}): LoginFieldErrors {
  const errors: { email?: string; password?: string } = {};
  const email = input.email.trim();

  if (email.length === 0) {
    errors.email = 'Informe o e-mail.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (input.password.length === 0) {
    errors.password = 'Informe a senha.';
  } else if (input.password.length < LOGIN_PASSWORD_MIN_LENGTH) {
    errors.password = `A senha deve ter pelo menos ${LOGIN_PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (input.password.length > LOGIN_PASSWORD_MAX_LENGTH) {
    errors.password = `A senha deve ter no máximo ${LOGIN_PASSWORD_MAX_LENGTH} caracteres.`;
  }

  return errors;
}

export function mapLoginValidationDetails(
  details: ReadonlyArray<{ readonly field: string; readonly issue: string }> | undefined,
): { fieldErrors: LoginFieldErrors; formError?: string } {
  if (!details || details.length === 0) {
    return {
      fieldErrors: {},
      formError: 'Verifique os dados informados.',
    };
  }

  const fieldErrors: { email?: string; password?: string } = {};
  let hasUnknownField = false;

  for (const detail of details) {
    if (detail.field === 'email') {
      fieldErrors.email = messageForIssue('email', detail.issue);
    } else if (detail.field === 'password') {
      fieldErrors.password = messageForIssue('password', detail.issue);
    } else {
      hasUnknownField = true;
    }
  }

  if (!fieldErrors.email && !fieldErrors.password) {
    return {
      fieldErrors: {},
      formError: 'Verifique os dados informados.',
    };
  }

  return {
    fieldErrors,
    formError: hasUnknownField ? 'Verifique os dados informados.' : undefined,
  };
}

function messageForIssue(field: 'email' | 'password', issue: string): string {
  if (field === 'email') {
    if (issue === 'required' || issue === 'required_string') {
      return 'Informe o e-mail.';
    }
    if (issue === 'invalid_format') {
      return 'Informe um e-mail válido.';
    }
    return 'Verifique o e-mail informado.';
  }

  if (issue === 'required' || issue === 'required_string') {
    return 'Informe a senha.';
  }
  if (issue === 'min_length') {
    return `A senha deve ter pelo menos ${LOGIN_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (issue === 'max_length') {
    return `A senha deve ter no máximo ${LOGIN_PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return 'Verifique a senha informada.';
}

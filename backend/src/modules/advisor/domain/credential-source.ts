export const AI_PROVIDER_CREDENTIAL_SOURCES = ['MANAGED', 'ENV', 'NONE'] as const;

export type AiProviderCredentialSource = (typeof AI_PROVIDER_CREDENTIAL_SOURCES)[number];

export function resolveProviderCredentialSource(input: {
  readonly hasManaged: boolean;
  readonly hasEnv: boolean;
}): AiProviderCredentialSource {
  if (input.hasManaged) {
    return 'MANAGED';
  }
  if (input.hasEnv) {
    return 'ENV';
  }
  return 'NONE';
}

export function isAiProviderCredentialSource(
  value: string,
): value is AiProviderCredentialSource {
  return (AI_PROVIDER_CREDENTIAL_SOURCES as readonly string[]).includes(value);
}

import type { ResolvedTheme, ResolveThemeInput } from '../types/theme';
import { resolveTheme } from '../resolver/resolve-theme';

/**
 * Theme Engine — pipeline oficial:
 * Design Tokens → Theme Default → Branding Runtime → Resolver → Resolved Theme → CSS Variables
 *
 * Fachada estável para integração futura com backend de branding.
 * Hoje: branding apenas via input local (mock / prop).
 */
export function runThemeEngine(input: ResolveThemeInput): ResolvedTheme {
  return resolveTheme(input);
}

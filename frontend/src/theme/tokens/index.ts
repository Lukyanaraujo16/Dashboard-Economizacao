import { durationTokens } from './duration';
import { elevationTokens } from './elevation';
import { opacityTokens } from './opacity';
import { radiusTokens } from './radius';
import { spacingTokens } from './spacing';
import { zIndexTokens } from './z-index';

export {
  durationTokens,
  elevationTokens,
  opacityTokens,
  radiusTokens,
  spacingTokens,
  zIndexTokens,
};

export const structuralTokens = {
  spacing: spacingTokens,
  radius: radiusTokens,
  elevation: elevationTokens,
  duration: durationTokens,
  zIndex: zIndexTokens,
  opacity: opacityTokens,
} as const;

import type { PanelIconKind, PanelIconProps } from '../financial';
import { PanelIcon } from '../financial';

export type EmptyPanelIconKind = PanelIconKind;
export type EmptyPanelIconProps = PanelIconProps;

/** @deprecated Preferir `PanelIcon` de `components/financial`. */
export function EmptyPanelIcon(props: EmptyPanelIconProps) {
  return <PanelIcon {...props} />;
}

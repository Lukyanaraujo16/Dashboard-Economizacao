import type { ReactNode } from 'react';

import {
  IconCircleCheckBig,
  IconCircleOff,
  IconPencilLine,
  IconTrash2,
  type UiIconProps,
} from '../ui/icons';

type IconProps = {
  readonly className?: string;
};

function toProps({ className }: IconProps): UiIconProps {
  return { className };
}

export function EditCompanyIcon({ className }: IconProps): ReactNode {
  return <IconPencilLine {...toProps({ className })} />;
}

export function DisableCompanyIcon({ className }: IconProps): ReactNode {
  return <IconCircleOff {...toProps({ className })} />;
}

export function ReactivateCompanyIcon({ className }: IconProps): ReactNode {
  return <IconCircleCheckBig {...toProps({ className })} />;
}

export function DeleteCompanyIcon({ className }: IconProps): ReactNode {
  return <IconTrash2 {...toProps({ className })} />;
}

import type { ReactNode } from 'react';

import {
  IconCircleCheckBig,
  IconCircleOff,
  IconKeyRound,
  IconLock,
  IconLockOpen,
  IconPencilLine,
  type UiIconProps,
} from '../ui/icons';

type IconProps = {
  readonly className?: string;
};

function toProps({ className }: IconProps): UiIconProps {
  return { className };
}

export function EditManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconPencilLine {...toProps({ className })} />;
}

export function BlockManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconLock {...toProps({ className })} />;
}

export function UnblockManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconLockOpen {...toProps({ className })} />;
}

export function DisableManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconCircleOff {...toProps({ className })} />;
}

export function EnableManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconCircleCheckBig {...toProps({ className })} />;
}

export function ResetPasswordManagedUserIcon({ className }: IconProps): ReactNode {
  return <IconKeyRound {...toProps({ className })} />;
}

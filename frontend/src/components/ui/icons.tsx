import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  BarChart3,
  Building2,
  CircleCheckBig,
  CircleOff,
  Eye,
  EyeOff,
  Gauge,
  Headphones,
  KeyRound,
  LayoutDashboard,
  List,
  Lock,
  LockOpen,
  LogOut,
  Monitor,
  Moon,
  PencilLine,
  Settings2,
  Shield,
  ShieldUser,
  Sun,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';

/** Tamanho padrão de ícones de UI (ações, nav, empty states). */
export const UI_ICON_SIZE = 16;

/** Stroke uniforme — visual mais fino/tecnológico. */
export const UI_ICON_STROKE = 1.75;

export type UiIconProps = Omit<LucideProps, 'ref'> & {
  readonly size?: number;
  readonly strokeWidth?: number;
};

function withDefaults(Icon: LucideIcon, props: UiIconProps) {
  const {
    size = UI_ICON_SIZE,
    strokeWidth = UI_ICON_STROKE,
    'aria-hidden': ariaHidden,
    ...rest
  } = props;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden={ariaHidden ?? true} {...rest} />;
}

/* ——— Navegação ——— */
export function IconLayoutDashboard(props: UiIconProps = {}) {
  return withDefaults(LayoutDashboard, props);
}
export function IconBuilding2(props: UiIconProps = {}) {
  return withDefaults(Building2, props);
}
export function IconShieldUser(props: UiIconProps = {}) {
  return withDefaults(ShieldUser, props);
}
export function IconSettings2(props: UiIconProps = {}) {
  return withDefaults(Settings2, props);
}
export function IconLogOut(props: UiIconProps = {}) {
  return withDefaults(LogOut, props);
}
export function IconHeadphones(props: UiIconProps = {}) {
  return withDefaults(Headphones, props);
}

/* ——— Ações ——— */
export function IconPencilLine(props: UiIconProps = {}) {
  return withDefaults(PencilLine, props);
}
export function IconKeyRound(props: UiIconProps = {}) {
  return withDefaults(KeyRound, props);
}
export function IconLock(props: UiIconProps = {}) {
  return withDefaults(Lock, props);
}
export function IconLockOpen(props: UiIconProps = {}) {
  return withDefaults(LockOpen, props);
}
export function IconCircleOff(props: UiIconProps = {}) {
  return withDefaults(CircleOff, props);
}
export function IconCircleCheckBig(props: UiIconProps = {}) {
  return withDefaults(CircleCheckBig, props);
}
export function IconTrash2(props: UiIconProps = {}) {
  return withDefaults(Trash2, props);
}

/* ——— Empty / painéis ——— */
export function IconBarChart3(props: UiIconProps = {}) {
  return withDefaults(BarChart3, props);
}
export function IconList(props: UiIconProps = {}) {
  return withDefaults(List, props);
}
export function IconTriangleAlert(props: UiIconProps = {}) {
  return withDefaults(TriangleAlert, props);
}

/* ——— Login / utilitários ——— */
export function IconEye(props: UiIconProps = {}) {
  return withDefaults(Eye, props);
}
export function IconEyeOff(props: UiIconProps = {}) {
  return withDefaults(EyeOff, props);
}
export function IconGauge(props: UiIconProps = {}) {
  return withDefaults(Gauge, props);
}
export function IconShield(props: UiIconProps = {}) {
  return withDefaults(Shield, props);
}
export function IconZap(props: UiIconProps = {}) {
  return withDefaults(Zap, props);
}

/* ——— Tema da interface ——— */
export function IconSun(props: UiIconProps = {}) {
  return withDefaults(Sun, props);
}
export function IconMoon(props: UiIconProps = {}) {
  return withDefaults(Moon, props);
}
export function IconMonitor(props: UiIconProps = {}) {
  return withDefaults(Monitor, props);
}

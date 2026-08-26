import {
  CalendarCheck,
  CheckSquare,
  Link2,
  NotebookPen,
  ScanLine,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AppProduct =
  'linksnap' | 'blogpress' | 'habitflow' | 'spendtrack' | 'verify' | 'consultation' | 'blog';

export interface AppProductDef {
  id: AppProduct;
  label: string;
  appPath: string;
  landingPath: string;
  icon: LucideIcon;
}

export const APP_PRODUCTS: AppProductDef[] = [
  {
    id: 'verify',
    label: 'التَّحقُّق من الشَّهادة',
    appPath: '/verify',
    landingPath: '/verify',
    icon: ScanLine,
  },
  {
    id: 'consultation',
    label: 'حجز استشارة',
    appPath: '/consultation/book',
    landingPath: '/consultation/book',
    icon: CalendarCheck,
  },
  {
    id: 'linksnap',
    label: 'إدارة الرَّوابط',
    appPath: '/linksnap/app',
    landingPath: '/linksnap',
    icon: Link2,
  },
  {
    id: 'blogpress',
    label: 'إدارة المقالات',
    appPath: '/blogpress/app',
    landingPath: '/blogpress',
    icon: NotebookPen,
  },
  {
    id: 'habitflow',
    label: 'إدارة العادات',
    appPath: '/habitflow/app',
    landingPath: '/habitflow',
    icon: CheckSquare,
  },
  {
    id: 'spendtrack',
    label: 'إدارة المصاريف',
    appPath: '/spendtrack/app',
    landingPath: '/spendtrack',
    icon: Wallet,
  },
];

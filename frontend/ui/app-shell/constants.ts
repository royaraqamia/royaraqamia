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
  hidden?: boolean;
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
    hidden: true,
  },
  {
    id: 'blogpress',
    label: 'إدارة المقالات',
    appPath: '/blogpress/app',
    landingPath: '/blogpress',
    icon: NotebookPen,
    hidden: true,
  },
  {
    id: 'habitflow',
    label: 'إدارة العادات',
    appPath: '/habitflow/app',
    landingPath: '/habitflow',
    icon: CheckSquare,
    hidden: true,
  },
  {
    id: 'spendtrack',
    label: 'إدارة المصاريف',
    appPath: '/spendtrack/app',
    landingPath: '/spendtrack',
    icon: Wallet,
    hidden: true,
  },
];

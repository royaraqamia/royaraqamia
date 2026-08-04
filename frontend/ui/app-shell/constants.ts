import { CheckSquare, Link2, NotebookPen, Wallet, type LucideIcon } from 'lucide-react';

export type AppProduct = 'linksnap' | 'blogpress' | 'habitflow' | 'spendtrack';

export interface AppProductDef {
  id: AppProduct;
  label: string;
  tagline: string;
  appPath: string;
  landingPath: string;
  icon: LucideIcon;
}

export const APP_PRODUCTS: AppProductDef[] = [
  {
    id: 'linksnap',
    label: 'LinkSnap',
    tagline: 'اختصار الروابط وتحليل النقرات',
    appPath: '/linksnap/app',
    landingPath: '/linksnap',
    icon: Link2,
  },
  {
    id: 'blogpress',
    label: 'BlogPress',
    tagline: 'تحرير المقالات ونشرها',
    appPath: '/blogpress/app',
    landingPath: '/blogpress',
    icon: NotebookPen,
  },
  {
    id: 'habitflow',
    label: 'HabitFlow',
    tagline: 'تتبّع عاداتك وبناء الاستمرارية',
    appPath: '/habitflow/app',
    landingPath: '/habitflow',
    icon: CheckSquare,
  },
  {
    id: 'spendtrack',
    label: 'SpendTrack',
    tagline: 'إدارة المصروفات والميزانية',
    appPath: '/spendtrack/app',
    landingPath: '/spendtrack',
    icon: Wallet,
  },
];

export function getAppProduct(id: AppProduct): AppProductDef {
  const product = APP_PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown app product: ${id}`);
  return product;
}

import { CheckSquare, Link2, NotebookPen, Wallet, type LucideIcon } from 'lucide-react';

export type AppProduct = 'linksnap' | 'blogpress' | 'habitflow' | 'spendtrack';

export interface AppProductDef {
  id: AppProduct;
  label: string;
  appPath: string;
  landingPath: string;
  icon: LucideIcon;
}

export const APP_PRODUCTS: AppProductDef[] = [
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

export function getAppProduct(id: AppProduct): AppProductDef {
  const product = APP_PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown app product: ${id}`);
  return product;
}

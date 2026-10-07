import { CalendarClock, Package, Rocket } from 'lucide-react';

import { APP_PRODUCTS } from '../app-shell/constants';
import type { NavLink } from './NavDropdown';

export const SERVICES_LINK: NavLink = {
  href: '#projects',
  label: 'خدماتنا',
  icon: Package,
  isRoute: false,
  visible: true,
  hasDropdown: true,
  dropdownKey: 'projects',
  subItems: [
    {
      href: '/request-project',
      label: 'طلب بناء مشروع',
      isRoute: true,
      icon: Rocket,
    },
    {
      href: '/hire',
      label: 'طلب التَّعاقُد الشَّهري',
      isRoute: true,
      icon: CalendarClock,
    },
    ...APP_PRODUCTS.filter((p) => !p.hidden).map((p) => ({
      href: p.landingPath,
      label: p.label,
      isRoute: true,
      icon: p.icon,
    })),
  ],
};

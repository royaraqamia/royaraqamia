import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  Coins,
  Download,
  GraduationCap,
  Link2,
  Newspaper,
  Package,
  Plug,
  Rocket,
  ScanBarcode,
  ScanLine,
  SquareCheck,
  StickyNote,
  SunMoon,
  Wallet,
} from 'lucide-react';

import type { NavLink } from './NavDropdown';
import { SERVICES_COPY } from './services-copy';

/**
 * The `خدماتنا` menu: its trigger and its sixteen rows, in the order the site ships.
 *
 * The words are [SERVICES_COPY] — one generated source, both clients, the app
 * drawing the same rows in `android/.../shell/ShellServices.kt` (#647) — and the
 * glyphs are the site's own `lucide-react` imports, converted for the app. The one
 * product the site hides (`blogpress`) has no row here, because a row a user cannot
 * reach is not a row.
 *
 * This used to be a mapping over `APP_PRODUCTS`; the table lives here now because
 * the menu is the only thing that ever read it, and a second copy of a label is
 * the drift the generated source exists to prevent (ADR-0098).
 */
export const SERVICES_LINK: NavLink = {
  href: '#services',
  label: SERVICES_COPY.trigger,
  icon: Package,
  isRoute: false,
  visible: true,
  hasDropdown: true,
  dropdownKey: 'projects',
  subItems: [
    {
      href: '/request-project',
      label: SERVICES_COPY.requestProject,
      isRoute: true,
      icon: Rocket,
    },
    {
      href: '/hire',
      label: SERVICES_COPY.hire,
      isRoute: true,
      icon: CalendarClock,
    },
    {
      href: '/news',
      label: SERVICES_COPY.news,
      isRoute: true,
      icon: Newspaper,
    },
    {
      href: '/training/apply',
      label: SERVICES_COPY.training,
      isRoute: true,
      icon: GraduationCap,
    },
    {
      href: '/verify',
      label: SERVICES_COPY.verify,
      isRoute: true,
      icon: ScanLine,
    },
    {
      href: '/consultation/book',
      label: SERVICES_COPY.consultation,
      isRoute: true,
      icon: CalendarCheck,
    },
    {
      href: '/rates',
      label: SERVICES_COPY.rates,
      isRoute: true,
      icon: Coins,
    },
    {
      href: '/downloader',
      label: SERVICES_COPY.downloader,
      isRoute: true,
      icon: Download,
    },
    {
      href: '/scan',
      label: SERVICES_COPY.scan,
      isRoute: true,
      icon: ScanBarcode,
    },
    {
      href: '/quran',
      label: SERVICES_COPY.quran,
      isRoute: true,
      icon: BookOpen,
    },
    {
      href: '/athkar',
      label: SERVICES_COPY.athkar,
      isRoute: true,
      icon: SunMoon,
    },
    {
      href: '/linksnap',
      label: SERVICES_COPY.linkSnap,
      isRoute: true,
      icon: Link2,
    },
    {
      href: '/habitflow',
      label: SERVICES_COPY.habitFlow,
      isRoute: true,
      icon: SquareCheck,
    },
    {
      href: '/spendtrack',
      label: SERVICES_COPY.spendTrack,
      isRoute: true,
      icon: Wallet,
    },
    {
      href: '/notes',
      label: SERVICES_COPY.notes,
      isRoute: true,
      icon: StickyNote,
    },
    {
      href: '/mcp/guide',
      label: SERVICES_COPY.mcpGuide,
      isRoute: true,
      icon: Plug,
    },
  ],
};

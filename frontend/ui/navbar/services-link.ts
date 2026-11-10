import {
  BookOpen,
  Coins,
  Link2,
  Newspaper,
  Plug,
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
 * The `تطبيقاتنا` sheet and the homepage strip: its trigger and its nine live
 * apps, in the order the site ships (ADR-0146). `/verify` and `/mcp/guide` are
 * retired from the picker (ADR-0152): they keep their row here so the copy and
 * the glyph stay one shared source, and the sheet, the strip and the catalog
 * filter `retired` out. Their routes and screens stay live.
 *
 * The one `pickerOnly` row at the end is the marketplace (ADR-0155): it opens
 * `/mcp/apps` under its own divider and section label, it is not one of our
 * apps, and it is excluded from `HOME_SERVICE_ROUTES` so a stranger's app never
 * becomes a homepage tab with no app behind it.
 *
 * The four lead forms left this list earlier (ADR-0148).
 *
 * The words are [SERVICES_COPY] — one generated source, both clients, the app
 * drawing the same rows in `android/.../shell/ShellServices.kt` (#647) — and the
 * glyphs are the site's own `lucide-react` imports, converted for the app.
 */
export const SERVICES_LINK: NavLink = {
  href: '#apps',
  label: SERVICES_COPY.trigger,
  icon: Plug,
  isRoute: false,
  visible: true,
  hasDropdown: true,
  dropdownKey: 'apps',
  subItems: [
    {
      href: '/news',
      label: SERVICES_COPY.news,
      isRoute: true,
      icon: Newspaper,
    },
    {
      href: '/verify',
      label: SERVICES_COPY.verify,
      isRoute: true,
      icon: ScanLine,
      retired: true,
    },
    {
      href: '/rates',
      label: SERVICES_COPY.rates,
      isRoute: true,
      icon: Coins,
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
      retired: true,
    },
    {
      href: '/mcp/apps',
      label: SERVICES_COPY.marketplace,
      hint: SERVICES_COPY.marketplaceHint,
      isRoute: true,
      icon: Plug,
      pickerOnly: true,
      sectionLabel: SERVICES_COPY.marketplaceSection,
    },
  ],
};

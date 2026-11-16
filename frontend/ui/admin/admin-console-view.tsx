import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck2,
  Flag,
  GraduationCap,
  Link2,
  Newspaper,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { ADMIN_CONSOLE_COPY } from './admin-console-copy';
import { Card, CardContent } from '@/frontend/ui/primitives/card';

/**
 * The console's section cards the app draws (#974, ADR-0193).
 *
 * The reference half of the pair: the native `AdminScreen` reads the same words
 * from `shared/copy/admin-console.json` and opens the same routes. The
 * announcement section is not here - a one-way broadcast to every member stays
 * the page's own card, because the review does not let that control cross into a
 * distributed binary (ADR-0193 decision 3).
 */
const SECTIONS = [
  {
    href: '/admin/certificates',
    label: ADMIN_CONSOLE_COPY.certificatesLabel,
    description: ADMIN_CONSOLE_COPY.certificatesDescription,
    icon: ShieldCheck,
  },
  {
    href: '/admin/training/cohorts',
    label: ADMIN_CONSOLE_COPY.trainingLabel,
    description: ADMIN_CONSOLE_COPY.trainingDescription,
    icon: GraduationCap,
  },
  {
    href: '/admin/consultations/bookings',
    label: ADMIN_CONSOLE_COPY.consultationsLabel,
    description: ADMIN_CONSOLE_COPY.consultationsDescription,
    icon: CalendarCheck2,
  },
  {
    href: '/admin/clients/project-requests',
    label: ADMIN_CONSOLE_COPY.clientsLabel,
    description: ADMIN_CONSOLE_COPY.clientsDescription,
    icon: Briefcase,
  },
  {
    href: '/admin/linksnap',
    label: ADMIN_CONSOLE_COPY.linksnapLabel,
    description: ADMIN_CONSOLE_COPY.linksnapDescription,
    icon: Link2,
  },
  {
    href: '/admin/plans',
    label: ADMIN_CONSOLE_COPY.plansLabel,
    description: ADMIN_CONSOLE_COPY.plansDescription,
    icon: Wallet,
  },
  {
    href: '/admin/news',
    label: ADMIN_CONSOLE_COPY.newsLabel,
    description: ADMIN_CONSOLE_COPY.newsDescription,
    icon: Newspaper,
  },
  {
    href: '/admin/mcp/marketplace',
    label: ADMIN_CONSOLE_COPY.marketplaceLabel,
    description: ADMIN_CONSOLE_COPY.marketplaceDescription,
    icon: Store,
  },
  {
    href: '/admin/reports',
    label: ADMIN_CONSOLE_COPY.reportsLabel,
    description: ADMIN_CONSOLE_COPY.reportsDescription,
    icon: Flag,
  },
];

export function AdminConsoleSections() {
  return (
    <>
      {SECTIONS.map((section) => {
        const Icon = section.icon;

        return (
          <Link
            key={section.href}
            href={section.href}
            className="group h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Card className="hover:border-primary/25 h-full">
              <CardContent className="flex items-start gap-3.5 sm:gap-4">
                <span className="border-border/50 bg-muted/60 dark:bg-neutral-800/60 flex size-11 shrink-0 items-center justify-center rounded-xl border sm:size-10">
                  <Icon className="text-primary size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block font-bold text-pretty">
                    {section.label}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-sm leading-relaxed text-pretty">
                    {section.description}
                  </span>
                </span>
                <ArrowLeft
                  className="text-muted-foreground/40 group-hover:text-primary mt-0.5 size-4 shrink-0 transition-safe duration-300 group-hover:-translate-x-1"
                  aria-hidden="true"
                />
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </>
  );
}

/**
 * The console page's header and its grid. `children` is the page's own
 * announcement card, which never crosses into the app (ADR-0193).
 */
export function AdminConsoleView({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title={ADMIN_CONSOLE_COPY.pageTitle} />

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <AdminConsoleSections />
        {children}
      </div>
    </div>
  );
}

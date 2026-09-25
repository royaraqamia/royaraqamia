'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/frontend/shared/cn';

const SECTIONS = [
  { href: '/admin/clients/project-requests', label: 'طلبات المشاريع' },
  { href: '/admin/clients/retainers', label: 'العقود الشَّهريَّة' },
];

export function ClientsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="أقسام العملاء"
      className="scrollbar-hide -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:mt-6"
    >
      {SECTIONS.map((section) => {
        const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

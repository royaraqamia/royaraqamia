'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/blogpress/dashboard', label: 'المقالات' },
  { href: '/blogpress/dashboard/profile', label: 'الملف الشخصي' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5" aria-label="التنقل الداخلي">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : undefined}
          className={cn(
            'px-3.5 py-2.5 text-sm rounded-lg transition-smooth',
            pathname === link.href
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

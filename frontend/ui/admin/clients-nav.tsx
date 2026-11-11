'use client';

import { usePathname } from 'next/navigation';

import { TabChipsNav } from '@/frontend/ui/primitives/tab-chips';

const SECTIONS = [
  { href: '/admin/clients/project-requests', label: 'طلبات المشاريع' },
  { href: '/admin/clients/retainers', label: 'التَّعاقُدات الشَّهريَّة' },
];

export function ClientsNav() {
  const pathname = usePathname();
  const active =
    SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
      ?.href ?? '';

  return (
    <TabChipsNav
      label="أقسام العملاء"
      items={SECTIONS.map((section) => ({ id: section.href, label: section.label }))}
      activeId={active}
      href={(id) => id}
      className="mt-5 sm:mt-6"
    />
  );
}

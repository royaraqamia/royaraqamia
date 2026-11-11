'use client';

import { usePathname } from 'next/navigation';

import { TabChipsNav } from '@/frontend/ui/primitives/tab-chips';

const SECTIONS = [
  { href: '/admin/training/cohorts', label: 'الدُّفعات' },
  { href: '/admin/training/applications', label: 'طلبات الالتحاق' },
];

export function TrainingNav() {
  const pathname = usePathname();
  const active =
    SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
      ?.href ?? '';

  return (
    <TabChipsNav
      label="أقسام إدارة التَّدريب"
      items={SECTIONS.map((section) => ({ id: section.href, label: section.label }))}
      activeId={active}
      href={(id) => id}
      className="mt-5 sm:mt-6"
    />
  );
}

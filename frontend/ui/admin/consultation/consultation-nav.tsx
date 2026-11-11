'use client';

import { usePathname } from 'next/navigation';

import { TabChipsNav } from '@/frontend/ui/primitives/tab-chips';

const SECTIONS = [
  { href: '/admin/consultations/bookings', label: 'الحجوزات' },
  { href: '/admin/consultations/availability', label: 'المواعيد' },
  { href: '/admin/consultations/packages', label: 'الباقات' },
  { href: '/admin/consultations/settings', label: 'الإعدادات' },
];

export function ConsultationNav() {
  const pathname = usePathname();
  const active =
    SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
      ?.href ?? '';

  return (
    <TabChipsNav
      label="أقسام إدارة الاستشارات"
      items={SECTIONS.map((section) => ({ id: section.href, label: section.label }))}
      activeId={active}
      href={(id) => id}
      className="mt-5 sm:mt-6"
    />
  );
}

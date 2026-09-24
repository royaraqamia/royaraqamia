import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck2,
  GraduationCap,
  Link2,
  Megaphone,
  ShieldCheck,
} from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { Card, CardContent } from '@/frontend/ui/primitives/card';

export const metadata: Metadata = {
  title: 'الإدارة',
  description: 'إدارة الشَّهادات والتَّدريب والاستشارات والرَّوابط في رؤيَة رقَميَّة.',
};

const SECTIONS = [
  {
    href: '/admin/certificates',
    label: 'إدارة الشَّهادات',
    description: 'إصدار وتعديل وحذف شهادات الطُّلاب',
    icon: ShieldCheck,
  },
  {
    href: '/admin/training/applications',
    label: 'طلبات التَّسجيل على التَّدريب',
    description: 'الطَّلبات الواردة من صفحة التَّقديم على الدَّورة',
    icon: GraduationCap,
  },
  {
    href: '/admin/consultations/bookings',
    label: 'إدارة الاستشارات',
    description: 'الحجوزات، المواعيد المتاحة، الباقات، وبيانات الدفع',
    icon: CalendarCheck2,
  },
  {
    href: '/admin/linksnap',
    label: 'إدارة الرَّوابط',
    description: 'إحصاءات المنصَّة ودليل الرَّوابط وحظر الرَّوابط',
    icon: Link2,
  },
  {
    href: '/admin/announcements',
    label: 'إرسال إعلان',
    description: 'إرسال إشعار لمستخدمين محددين أو لجميع المستخدمين المسجَّلين',
    icon: Megaphone,
  },
];

export default function AdminConsolePage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={ShieldCheck}
        title="الإدارة"
        description="إدارة الشهادات والتَّدريب والاستشارات والرَّوابط"
      />

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
      </div>
    </div>
  );
}

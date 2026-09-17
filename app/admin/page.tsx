import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck2, GraduationCap, Link2, Megaphone, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/frontend/ui/primitives/card';

export const metadata: Metadata = {
  title: 'الإدارة',
  description: 'إدارة الشَّهادات والتَّدريب والاستشارات والرَّوابط في رؤية رقمية.',
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
    <div className="container mx-auto max-w-6xl px-4 pb-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
          <ShieldCheck className="text-primary size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الإدارة</h1>
          <p className="text-muted-foreground text-sm">
            إدارة الشهادات والتَّدريب والاستشارات والرَّوابط
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;

          return (
            <Link
              key={section.href}
              href={section.href}
              className="h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Card className="h-full">
                <CardContent className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/60 dark:bg-neutral-800/60">
                    <Icon className="text-primary size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-foreground">{section.label}</span>
                    <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">
                      {section.description}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

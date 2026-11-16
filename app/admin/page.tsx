import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Megaphone } from 'lucide-react';
import { AdminConsoleView } from '@/frontend/ui/admin/admin-console-view';
import { ADMIN_CONSOLE_COPY } from '@/frontend/ui/admin/admin-console-copy';
import { Card, CardContent } from '@/frontend/ui/primitives/card';

export const metadata: Metadata = {
  title: ADMIN_CONSOLE_COPY.pageTitle,
  description: 'إدارة الشَّهادات والتَّدريب والاستشارات والرَّوابط في رؤيَة رقَميَّة.',
};

export default function AdminConsolePage() {
  return (
    <AdminConsoleView>
      {/*
        The app does not draw this section: a one-way broadcast to every member is
        not a control the APK may carry (ADR-0193 decision 3), so the card stays
        the page's own and keeps its words here rather than in the shared copy
        source the native pair reads.
      */}
      <Link
        href="/admin/announcements"
        className="group h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Card className="hover:border-primary/25 h-full">
          <CardContent className="flex items-start gap-3.5 sm:gap-4">
            <span className="border-border/50 bg-muted/60 dark:bg-neutral-800/60 flex size-11 shrink-0 items-center justify-center rounded-xl border sm:size-10">
              <Megaphone className="text-primary size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block font-bold text-pretty">إرسال إعلان</span>
              <span className="text-muted-foreground mt-1 block text-sm leading-relaxed text-pretty">
                إرسال إشعار لمستخدمين محددين أو لجميع المستخدمين المسجَّلين
              </span>
            </span>
            <ArrowLeft
              className="text-muted-foreground/40 group-hover:text-primary mt-0.5 size-4 shrink-0 transition-safe duration-300 group-hover:-translate-x-1"
              aria-hidden="true"
            />
          </CardContent>
        </Card>
      </Link>
    </AdminConsoleView>
  );
}

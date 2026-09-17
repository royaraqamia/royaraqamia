import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إرسال إعلان',
  description: 'إرسال إشعار لمستخدمين محددين أو لجميع المستخدمين في رؤية رقمية.',
};

export default function AdminAnnouncementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-3xl px-4 pb-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
          <Megaphone className="text-primary size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إرسال إعلان</h1>
          <p className="text-muted-foreground text-sm">
            يُرسل إشعارًا لمستخدمين محددين أو لجميع المستخدمين المسجلين
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

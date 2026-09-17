import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إدارة الشَّهادات',
  description: 'إصدار وتعديل وحذف شهادات الطُّلاب في رؤية رقمية.',
};

export default function AdminCertificatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
          <ShieldCheck className="text-primary size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إدارة الشَّهادات</h1>
          <p className="text-muted-foreground text-sm">إصدار وتعديل وحذف شهادات الطُّلاب</p>
        </div>
      </div>

      {children}
    </div>
  );
}

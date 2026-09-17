import type { Metadata } from 'next';
import { Link2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إدارة الرَّوابط',
  description: 'إحصاءات المنصَّة ودليل الرَّوابط الكامل وحظر الرَّوابط في رؤية رقمية.',
};

export default function AdminLinkSnapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
          <Link2 className="text-primary size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إدارة الرَّوابط</h1>
          <p className="text-muted-foreground text-sm">
            إحصاءات المنصَّة، دليل الرَّوابط الكامل، وحظر الرَّوابط
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'طلبات الالتحاق',
  description: 'طلبات الالتحاق بدورة التَّدريب في رؤية رقمية.',
};

export default function AdminTrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
          <GraduationCap className="text-primary size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">طلبات الالتحاق</h1>
          <p className="text-muted-foreground text-sm">
            الطَّلبات الواردة من صفحة التَّقديم على الدَّورة
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

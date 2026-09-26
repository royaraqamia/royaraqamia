import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';
import { RETAINER_DEFAULT_MONTHLY_FEE_USD } from '@/shared/contracts/retainers';

export const metadata: Metadata = {
  title: 'التَّوظيف الشَّهري',
  description: `اطلب التَّوظيف الشَّهري من رؤيَة رَقَميَّة: صيانة وتطوير وإدارة مشاريعك مقابل ${RETAINER_DEFAULT_MONTHLY_FEE_USD}$ شهريًّا. املأ النَّموذج واحصل على رقم طلب فورًا.`,
};

export default function HireLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}

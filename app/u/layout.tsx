import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'أعضاء المجتمع',
    template: '%s | رؤيَة رقَميَّة',
  },
  description: 'ملفات أعضاء مجتمع رؤيَة رقَميَّة ومنشوراتهم.',
};

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-foreground flex flex-col pt-16 lg:pt-20">
      <main id="main-content" className="flex-1 container mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pb-14">
        {children}
      </main>
    </div>
  );
}

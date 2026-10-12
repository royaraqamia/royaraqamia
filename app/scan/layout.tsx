import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'ماسح QR و Barcode',
    template: '%s | رؤيَة رقَميَّة',
  },
  description:
    'اقرأ أيَّ رمز QR أو باركود بكاميرا هاتفك أو بصورة مرفوعة: روابط، بريد، هاتف، شبكات WiFi، جهات اتِّصال وشهادات. القراءة تتمُّ على جهازك ولا تُرسَل أيُّ صورة إلى خادم.',
  alternates: { canonical: '/scan' },
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}

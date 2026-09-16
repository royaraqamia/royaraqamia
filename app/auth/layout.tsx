import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'المصادقة',
    template: '%s | رؤية رقمية',
  },
  description: 'تسجيل الدُّخول أو إنشاء حساب جديد في رؤية رقمية للوصول إلى الخدمات والمنتجات.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col relative overflow-hidden">
      <Navbar />
      <main
        id="main-content"
        className="flex-1 flex items-center justify-center py-24 px-4 relative z-10"
      >
        {children}
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'المصادقة',
    template: '%s | رؤية رقمية',
  },
  description: 'تسجيل الدُّخول أو إنشاء حساب جديد في رؤية رقمية للوصول إلى الخدمات والمنتجات.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Decorative background elements — kept static: floating 320-384px
          blurred orbs would recomposite their textures continuously behind
          the login/signup forms for an ambient drift nobody tracks. */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 size-96 rounded-full bg-primary/8 glow-blur-lg max-md:glow-blur-sm" />
        <div className="absolute bottom-1/3 -right-32 size-80 rounded-full bg-accent-indigo/8 glow-blur-md max-md:glow-blur-sm" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-150 rounded-full bg-primary/3 glow-blur-xl max-md:glow-blur-md" />
      </div>
      {/* Subtle noise overlay */}
      <div className="fixed inset-0 pointer-events-none noise-texture" />

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

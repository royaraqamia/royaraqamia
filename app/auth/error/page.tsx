import Link from 'next/link';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

export default function AuthErrorPage() {
  return (
    <AuthCard title="خطأ في المصادقة">
      <div className="flex flex-col items-center text-center gap-6">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="hsl(var(--destructive))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-muted-foreground">حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.</p>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center h-12 px-8 rounded-full gradient-primary text-white font-semibold hover:opacity-90 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 active:scale-95 shadow-sm hover:shadow-md cta-glow"
        >
          تسجيل الدخول
        </Link>
      </div>
    </AuthCard>
  );
}

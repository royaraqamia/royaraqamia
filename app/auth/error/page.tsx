import Link from 'next/link';
import { AuthCard } from '@/frontend/ui/auth/AuthCard';

export default function AuthErrorPage() {
  return (
    <AuthCard title="خطأ في المصادقة">
      <section
        className="flex flex-col items-center text-center px-2 py-3 sm:px-4 space-y-6 sm:space-y-8 max-w-sm mx-auto"
        dir="rtl"
        aria-live="polite"
      >
        {/* Visual Error Badge with Multi-Layered Glow Effect */}
        <div className="relative group flex items-center justify-center">
          {/* Ambient Background Radial Glow */}
          <div
            className="absolute -inset-2 rounded-full bg-red-500/15 dark:bg-red-500/25 blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            aria-hidden="true"
          />

          {/* Glassmorphic Icon Badge */}
          <div className="relative flex items-center justify-center size-20 rounded-2xl bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 dark:border-red-500/30 backdrop-blur-md shadow-xs transition-transform duration-300 ease-out group-hover:scale-105">
            <svg
              className="size-8 text-red-600 dark:text-red-400 transition-transform duration-300 group-hover:rotate-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        {/* Message Content */}
        <div className="space-y-2">
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-normal leading-relaxed tracking-wide">
            حدث خطأ أثناء المصادقة. يُرجَى المحاولة مرَّة أخرى.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="w-full pt-1">
          <Link
            href="/auth/login"
            className="group relative inline-flex items-center justify-center w-full h-11 px-6 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-slate-50 dark:text-slate-900 font-medium text-sm transition-all duration-300 ease-out shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 overflow-hidden"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              تسجيل الدُّخول
            </span>
            {/* Subtle Sheen Hover Layer */}
            <span
              className="absolute inset-0 bg-white/10 dark:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>
    </AuthCard>
  );
}

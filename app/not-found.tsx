import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - الصفحة غير موجودة | رؤية رقمية',
  description: 'عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
};

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
          <div className="mb-8">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 shadow-lg shadow-primary/10">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mb-4 text-6xl font-bold text-foreground">404</h1>
            <h2 className="mb-4 text-2xl font-bold text-primary font-heading">الصفحة غير موجودة</h2>
            <p className="mx-auto mb-8 max-w-md text-muted-foreground">
              عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-primary/25 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-[44px]"
          >
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </body>
    </html>
  );
}

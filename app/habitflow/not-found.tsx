import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <main id="main-content" className="flex flex-col items-center justify-center px-6 pt-24">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
          ٤٠٤ - الصفحة غير موجودة
        </h1>
        <p className="text-muted-foreground mb-8">الصفحة التي تبحث عنها غير موجودة.</p>
        <Link href="/habitflow">
          <Button variant="default">العودة إلى الرئيسية</Button>
        </Link>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'الموقع غير متصل — رؤية رقمية',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4" dir="rtl">
      <div className="mx-auto max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-10 w-10 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636a9 9 0 0 1 0 12.728m-12.728 0a9 9 0 0 1 0-12.728m9.9 2.829a5.25 5.25 0 0 1 0 7.07m-7.072 0a5.25 5.25 0 0 1 0-7.07M12 12v.008"
              />
            </svg>
          </div>
        </div>
        <h1 className="mb-2 font-arabic text-2xl font-bold text-foreground">الموقع غير متصل</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          يبدو أنَّك غير متَّصل بالإنترنت. حاول مرَّة أخرى عندما تتوفَّر لديك شبكة.
        </p>
      </div>
    </div>
  );
}

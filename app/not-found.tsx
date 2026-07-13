import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
          <div className="mb-8">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-600 to-violet-400 shadow-lg shadow-purple-500/25">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mb-4 text-6xl font-bold text-white">404</h1>
            <h2 className="mb-4 text-2xl font-bold text-purple-300">الصفحة غير موجودة</h2>
            <p className="mx-auto mb-8 max-w-md text-gray-400">
              عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-violet-500 px-8 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-purple-500/30"
          >
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </body>
    </html>
  );
}

import Link from 'next/link';

export default function LinkSnapPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="max-w-lg text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold">
          LS
        </div>
        <h1 className="text-3xl font-bold">LinkSnap</h1>
        <p className="text-muted-foreground text-lg">اختصار الروابط مع تحليلات בזמן حقيقي</p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/auth/login?redirect=/linksnap"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            تسجيل الدخول
          </Link>
          <Link
            href="/auth/signup?redirect=/linksnap"
            className="px-6 py-3 border border-border rounded-xl font-medium hover:bg-white/5 transition-colors"
          >
            إنشاء حساب
          </Link>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-block mt-4"
        >
          العودة إلى royaraqamia
        </Link>
      </div>
    </div>
  );
}

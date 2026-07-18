export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">خطأ في المصادقة</h1>
        <p className="text-muted-foreground">حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.</p>
        <a
          href="/auth/login"
          className="inline-block py-3 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          تسجيل الدخول
        </a>
      </div>
    </div>
  );
}

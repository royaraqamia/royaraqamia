import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/blogpress/theme-toggle';
import { PenLine, Search, Zap, ArrowLeft } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        تخطي إلى المحتوى
      </a>

      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <Link
            href="/blogpress"
            className="flex items-center gap-2.5 transition-smooth hover:opacity-80"
          >
            <Image src="/logo.webp" alt="BlogPress" width={1000} height={1000} className="size-8" />
            <span className="text-lg font-bold tracking-tight">BlogPress</span>
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="التنقل الرئيسي">
            <ThemeToggle />
            <Link
              href="/blogpress/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-smooth px-3 py-2 rounded-lg hover:bg-muted"
            >
              المدونة
            </Link>
            <Link href="/auth/login?redirect=/blogpress">
              <Button size="sm" className="transition-smooth shadow-sm hover:shadow-md">
                تسجيل الدخول
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-primary/[0.02] to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/[0.03] rounded-full blur-3xl" />
          <div className="container mx-auto px-4 sm:px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 relative">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground mb-8 backdrop-blur-sm transition-smooth hover:bg-muted">
                <span
                  className="size-1.5 rounded-full bg-primary animate-pulse"
                  aria-hidden="true"
                />
                منصة تدوين حديثة
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-[1.15]">
                اكتب. انشر.{' '}
                <span className="text-primary relative">
                  تم.
                  <span className="absolute bottom-0 right-0 w-full h-2 bg-primary/15 -z-10 rounded-full" />
                </span>
              </h1>
              <p className="mt-7 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
                منصة تدوين خفيفة للمطورين والكتّاب. مبنية بـ Markdown، محسّنة لمحركات البحث، وخالية
                من المشتتات.
              </p>
              <div className="mt-11 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/auth/login?redirect=/blogpress">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto shadow-sm hover:shadow-md transition-smooth h-11 px-6"
                  >
                    ابدأ الكتابة مجاناً
                    <ArrowLeft className="mr-2 size-4" />
                  </Button>
                </Link>
                <Link href="/blogpress/blog">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto transition-smooth h-11 px-6"
                  >
                    اقرأ المدونة
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border/50">
          <div className="container mx-auto px-4 sm:px-6 py-20 sm:py-24">
            <div className="grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
              <div className="group flex flex-col items-center text-center gap-4 p-6 rounded-2xl border border-border/40 bg-card/50 hover-lift transition-smooth">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-smooth group-hover:bg-primary/15 group-hover:scale-105">
                  <PenLine className="size-5" />
                </div>
                <h3 className="font-semibold text-base">تحرير بـ Markdown</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  اكتب بتنسيق Markdown المألوف. معاينة فورية، وحفظ تلقائي.
                </p>
              </div>
              <div className="group flex flex-col items-center text-center gap-4 p-6 rounded-2xl border border-border/40 bg-card/50 hover-lift transition-smooth">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-smooth group-hover:bg-primary/15 group-hover:scale-105">
                  <Search className="size-5" />
                </div>
                <h3 className="font-semibold text-base">محسّن للبحث</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  بيانات SEO مخصصة لكل مقال. وصف، عنوان، وصورة غلاف.
                </p>
              </div>
              <div className="group flex flex-col items-center text-center gap-4 p-6 rounded-2xl border border-border/40 bg-card/50 hover-lift transition-smooth">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-smooth group-hover:bg-primary/15 group-hover:scale-105">
                  <Zap className="size-5" />
                </div>
                <h3 className="font-semibold text-base">سريع وخفيف</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  مبنية بـ Next.js و Supabase. أداء عالي بدون تعقيد.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8" role="contentinfo">
        <div className="container mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} BlogPress. مبني بـ Next.js.
        </div>
      </footer>
    </div>
  );
}

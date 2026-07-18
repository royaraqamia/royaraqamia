import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/spendtrack/theme-toggle';
import { ArrowLeft, Shield, BarChart3, Sparkles } from 'lucide-react';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/spendtrack/dashboard');
  return (
    <div className="flex flex-col min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--primary)/5%,_transparent_50%)]">
      <header className="flex items-center justify-between px-6 py-4 animate-fade-in">
        <Link href="/spendtrack" aria-label="SpendTrack - الرئيسية">
          <div className="relative size-8">
            <Image src="/logo.webp" alt="SpendTrack" fill sizes="32px" priority />
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/auth/signup?redirect=/spendtrack">
            <Button className="text-sm">إنشاء حساب</Button>
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        className="flex-1 flex flex-col items-center justify-center px-6 text-center"
      >
        <div className="animate-slide-up">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-tight">
            تحكم في{' '}
            <span className="bg-gradient-to-l from-primary via-primary/80 to-primary bg-clip-text text-transparent">
              إنفاقك
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground leading-relaxed">
            سجل مصروفاتك، صنفها، وتصور عادات الإنفاق الخاصة بك باستخدام رسوم بيانية تفاعلية. بسيط،
            خاص، ومجاني.
          </p>
          <Link href="/auth/signup?redirect=/spendtrack" className="mt-8 inline-block">
            <Button
              size="lg"
              className="text-base px-8 premium-shadow-md hover:premium-shadow-lg transition-all duration-300 group"
            >
              ابدأ الآن
              <ArrowLeft className="mr-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full animate-slide-up stagger-3">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card/50 p-6 premium-shadow-sm transition-all duration-300 hover:premium-shadow-md hover:-translate-y-0.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <h3 className="font-medium text-sm">رسوم بيانية تفاعلية</h3>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              تصور أنماط إنفاقك برسوم بيانية جميلة
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card/50 p-6 premium-shadow-sm transition-all duration-300 hover:premium-shadow-md hover:-translate-y-0.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success/10">
              <Shield className="size-5 text-success" />
            </div>
            <h3 className="font-medium text-sm">خصوصية تامة</h3>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              بياناتك آمنة ومحمية دائماً
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card/50 p-6 premium-shadow-sm transition-all duration-300 hover:premium-shadow-md hover:-translate-y-0.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning/10">
              <Sparkles className="size-5 text-warning" />
            </div>
            <h3 className="font-medium text-sm">بساطة الأداء</h3>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              واجهة نظيفة وسريعة بدون تعقيد
            </p>
          </div>
        </div>
      </main>
      <footer className="border-t border-border/60 px-6 py-6 animate-fade-in">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative size-5">
              <Image src="/logo.webp" alt="SpendTrack" fill sizes="20px" loading="lazy" />
            </div>
            <span className="text-xs text-muted-foreground">SpendTrack</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SpendTrack. جميع الحقوق محفوظة.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login?redirect=/spendtrack"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
              aria-label="تسجيل الدخول إلى حسابك"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/auth/signup?redirect=/spendtrack"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
              aria-label="إنشاء حساب جديد في SpendTrack"
            >
              إنشاء حساب
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

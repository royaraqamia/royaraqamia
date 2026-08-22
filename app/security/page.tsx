import type { Metadata } from 'next';
import { Navbar } from '../../frontend/ui/Navbar';
import { Footer } from '../../frontend/ui/Footer';

export const metadata: Metadata = {
  title: 'سياسة الأمان',
  description: 'سياسة الأمان في رؤية رقمية – كيفيَّة الإبلاغ عن الثَّغرات الأمنيَّة بطريقة مسؤولة.',
  alternates: { canonical: '/security' },
  openGraph: {
    title: 'سياسة الأمان | رؤية رقمية',
    description:
      'سياسة الأمان في رؤية رقمية – كيفيَّة الإبلاغ عن الثَّغرات الأمنيَّة بطريقة مسؤولة.',
    url: '/security',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'سياسة الأمان' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'سياسة الأمان | رؤية رقمية',
    description:
      'سياسة الأمان في رؤية رقمية – كيفيَّة الإبلاغ عن الثَّغرات الأمنيَّة بطريقة مسؤولة.',
    images: ['/OG Image.webp'],
  },
};

export default function SecurityPage() {
  return (
    <div className="relative min-h-dvh bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary antialiased">
      <Navbar />

      <main id="main-content" className="flex-1 pt-24 pb-16 md:pt-32 md:pb-24" dir="rtl">
        {/* Subtle Ambient Background Gradient Glow */}
        <div className="absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden pointer-events-none select-none">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-250 h-87.5 bg-linear-to-b from-primary/10 via-primary/5 to-transparent blur-3xl opacity-60 dark:opacity-40" />
        </div>

        <div className="cv-auto mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Hero Header Section */}
          <header className="mb-12 text-start">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
              سياسة الأمان
            </h1>
          </header>

          {/* SLA Performance Metrics Section */}
          <section
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10"
            aria-label="التزامات وقت الاستجابة"
          >
            <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card/60 p-5 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">تأكيد الاستلام</span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center transition-transform group-hover:scale-110">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mb-1">
                48 ساعة
              </div>
              <p className="text-xs text-muted-foreground">
                نتعهَّد بتأكيد استلام التَّقرير خلال هذه المدة.
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card/60 p-5 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">تحديث الحالة</span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center transition-transform group-hover:scale-110">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mb-1">
                5 أيَّام عمل
              </div>
              <p className="text-xs text-muted-foreground">
                تقديم تحديث عن حالة التقييم والمعالجة.
              </p>
            </div>
          </section>

          {/* Structured Policy Cards */}
          <div className="space-y-8">
            {/* Section 1: Reporting Vulnerabilities */}
            <article className="rounded-2xl border border-border/80 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-border">
              <header className="flex items-center gap-3.5 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  1. الإبلاغ عن الثَّغرات الأمنيَّة
                </h2>
              </header>

              <div className="space-y-4 text-muted-foreground leading-relaxed text-sm sm:text-base">
                <p>
                  تأخذ <strong className="text-foreground font-semibold">رؤية رقمية</strong> أمان
                  منصَّتها على محمل الجد. إذا اكتشفت ثغرة أمنيَّة، يُرجَى الإبلاغ عنها{' '}
                  <strong className="text-foreground font-semibold">بشكل مسؤول</strong> وعدم نشرها
                  علنًا قبل معالجتها.
                </p>

                <ul className="space-y-3 pt-2">
                  <li className="flex items-start gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/40">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <span className="text-foreground/90">
                      أرسِل تقريرك إلى:{' '}
                      <a
                        href="mailto:contact@royaraqamia.com?subject=%5BSECURITY%5D"
                        className="font-medium text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm dir-ltr inline-block"
                      >
                        contact@royaraqamia.com
                      </a>
                    </span>
                  </li>

                  <li className="flex items-start gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/40">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 7h10M7 12h10M7 17h10"
                        />
                      </svg>
                    </div>
                    <span className="text-foreground/90">
                      اجعل عنوان الرِّسالة يبدأ بالبادئة:{' '}
                      <code className="px-2 py-0.5 rounded bg-muted text-foreground text-xs font-mono font-semibold dir-ltr inline-block border border-border/60">
                        [SECURITY]
                      </code>
                    </span>
                  </li>

                  <li className="flex items-start gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/40">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                      </svg>
                    </div>
                    <span className="text-foreground/90">
                      قدِّم، إن أمكن: خطوات إعادة الإنتاج، الأثر المُحتمَل، والاقتراح العلاجي إن
                      وُجِد.
                    </span>
                  </li>

                  <li className="flex items-start gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/40">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <span className="text-foreground/90">
                      لا تشارك بيانات مستخدمين حقيقيِّين داخل التَّقرير.
                    </span>
                  </li>
                </ul>

                <p className="mt-4 pt-3 border-t border-border/40 text-sm">
                  نتعهَّد بتأكيد استلام التَّقرير خلال{' '}
                  <strong className="text-foreground font-semibold">48 ساعة</strong>، وتقديم تحديث
                  عن الحالة خلال{' '}
                  <strong className="text-foreground font-semibold">5 أيَّام عمل</strong>.
                </p>
              </div>
            </article>

            {/* Section 2: In-Scope Vulnerabilities */}
            <article className="rounded-2xl border border-border/80 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-border">
              <header className="flex items-center gap-3.5 mb-6">
                <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0 border border-success/20">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  2. نطاق التَّغطية
                </h2>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { text: 'التَّنفيذ البرمجي عن بُعد', badge: 'RCE' },
                  { text: 'حقن البرمجة النَّصِّيَّة عبر المواقع', badge: 'XSS' },
                  { text: 'تزوير الطَّلبات عبر المواقع', badge: 'CSRF' },
                  { text: 'تجاوز المصادقة أو التَّفويض', badge: 'Auth Bypass' },
                  { text: 'كشف البيانات الحسَّاسة', badge: 'Data Exposure' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm font-medium text-foreground/90">{item.text}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-success/10 text-success border border-success/20 font-semibold dir-ltr shrink-0">
                      {item.badge}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            {/* Section 3: Out-of-Scope */}
            <article className="rounded-2xl border border-border/80 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-border">
              <header className="flex items-center gap-3.5 mb-6">
                <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0 border border-warning/20">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  3. خارج النِّطاق
                </h2>
              </header>

              <ul className="space-y-3">
                {[
                  'الثَّغرات في المكتبات الخارجيَّة التي تُغطِّيها برامج الإفصاح الخاصَّة بها.',
                  'هجمات الهندسة الاجتماعيَّة ضدَّ المُشغِّل.',
                  'تعرُّض ذاتي (Self-XSS) دون أثر مُثبَت.',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/40"
                  >
                    <div className="w-5 h-5 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            {/* Section 4: Data Protection */}
            <article className="rounded-2xl border border-border/80 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-border">
              <header className="flex items-center gap-3.5 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  4. حماية البيانات
                </h2>
              </header>

              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                نلتزم بحماية بياناتك الشَّخصيَّة وِفق أفضل الممارسات: التَّشفير أثناء النَّقل
                (HTTPS/TLS) وعند التَّخزين، وتطبيق مبدأ الحدّ الأدنى من جمع البيانات، واحترام حقوق
                الوصول والتَّصحيح والحذف. للمزيد، راجع{' '}
                <a
                  href="/privacy"
                  className="font-semibold text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
                >
                  سياسة الخصوصيَّة
                </a>
                .
              </p>
            </article>

            {/* Section 5: Direct Action Callout Card */}
            <article className="relative overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-br from-primary/10 via-background to-card p-6 sm:p-8 shadow-xl shadow-primary/5 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/40">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                      5. التَّواصل
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    للاستفسارات الأمنيَّة أو الإبلاغ عن ثغرة أمنيَّة بشكل مباشر:
                  </p>
                </div>

                <a
                  href="mailto:contact@royaraqamia.com?subject=%5BSECURITY%5D"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shrink-0 dir-ltr"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>contact@royaraqamia.com</span>
                </a>
              </div>
            </article>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

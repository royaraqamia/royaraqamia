import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'شروط الاستخدام',
  description:
    'شروط الاستخدام لـ رؤية رقمية – اقرأ الشُّروط والالتزامات المُتعلِّقة باستخدام خدماتنا.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'شُروط الاستخدام | رؤية رقمية',
    description:
      'شروط الاستخدام لـ رؤية رقمية – اقرأ الشُّروط والالتزامات المُتعلِّقة باستخدام خدماتنا.',
    url: '/terms',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'شروط الاستخدام' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'شروط الاستخدام | رؤية رقمية',
    description:
      'شروط الاستخدام لـ رؤية رقمية – اقرأ الشُّروط والالتزامات المُتعلِّقة باستخدام خدماتنا.',
    images: ['/OG Image.webp'],
  },
};

export default function TermsPage() {
  return (
    <div className="relative min-h-screen antialiased selection:bg-primary/20" dir="rtl">
      {/* Dynamic Ambient Background Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 h-125 w-125 rounded-full bg-linear-to-br from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl dark:from-indigo-500/20 dark:via-purple-500/10" />
        <div className="absolute top-1/3 -left-40 h-100 w-100 rounded-full bg-linear-to-tr from-fuchsia-500/10 via-violet-500/5 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {/* Modern SaaS Header */}
        <header className="mb-12 border-b border-border/60 pb-8 sm:mb-16 sm:pb-12">
          <h1 className="text-3xl font-black leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            شروط الاستخدام
          </h1>
        </header>

        {/* Responsive Grid Architecture */}
        <div className="items-start lg:grid lg:grid-cols-12 lg:gap-12">
          {/* Main Content Sections Column */}
          <main className="cv-auto space-y-8 text-base leading-relaxed text-muted-foreground sm:space-y-10 lg:col-span-8">
            {/* 01. المقدمة */}
            <section
              id="section-1"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  01
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. المُقدِّمة</h2>
              </div>
              <p className="leading-relaxed text-muted-foreground sm:text-lg">
                مرحبًا بك في <strong className="font-bold text-foreground">رؤية رقمية</strong>{' '}
                (&quot;نحنُ&quot; أو &quot;المُشغِّل&quot;). باستخدامك لمواقعنا وخدماتنا، فإنَّك
                توافق على الالتزام بهذه الشُّروط. إذا لم توافق على أيٍّ من هذه الشُروط، يُرجَى عدم
                استخدام خدماتنا.
              </p>
            </section>

            {/* 02. وصف الخدمات */}
            <section
              id="section-2"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  02
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. وصف الخدمات</h2>
              </div>
              <p className="mb-6 text-muted-foreground">
                تُقدِّم رؤية رقمية خدمة بناء مواقع وتطبيقات؛ كما تُقدِّم للطُّلاب والخرِّيجين الجدد
                تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات مع شهادة مُوثَّقة من قِبَلنا.
                كما نُقدِّم أدوات وتطبيقات مُساعِدة مثل:
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="flex items-center gap-3.5 rounded-2xl border border-border/50 bg-muted/60 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </div>
                  <div>
                    <strong className="block font-semibold text-foreground">LinkSnap</strong>
                    <span className="text-xs text-muted-foreground">أداة اختصار الرَّوابط</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-border/50 bg-muted/60 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                      />
                    </svg>
                  </div>
                  <div>
                    <strong className="block font-semibold text-foreground">BlogPress</strong>
                    <span className="text-xs text-muted-foreground">منصَّة إدارة المدوَّنات</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-border/50 bg-muted/60 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <strong className="block font-semibold text-foreground">HabitFlow</strong>
                    <span className="text-xs text-muted-foreground">تطبيق إدارة العادات</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-border/50 bg-muted/60 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <strong className="block font-semibold text-foreground">SpendTrack</strong>
                    <span className="text-xs text-muted-foreground">تطبيق تتبُّع المصروفات</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 03. الحساب والمُصادقة */}
            <section
              id="section-3"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  03
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                  . الحساب والمُصادقة
                </h2>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border/40 bg-muted/40 p-5">
                  <h3 className="mb-3 flex items-center gap-2.5 text-lg font-bold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                      أ
                    </span>
                    إنشاء الحساب
                  </h3>
                  <ul className="space-y-2.5 pr-1">
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>يجب أن يكون عمرك عامًا على الأقل لإنشاء حساب.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>يجب تقديم معلومات دقيقة ومُحدَّثَة أثناء التَّسجيل.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>أنت مسؤول عن الحفاظ على سرِّيَّة كلمة المرور الخاصَّة بك.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>أنت مسؤول عن جميع الأنشطة التي تتمُّ تحت حسابك.</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-border/40 bg-muted/40 p-5">
                  <h3 className="mb-2 flex items-center gap-2.5 text-lg font-bold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                      ب
                    </span>
                    الدُّخول عبر Google
                  </h3>
                  <p className="text-muted-foreground">
                    عند استخدام ميزة الدُّخول بحساب Google، أنت تمنحنا إذنًا بالوصول إلى معلومات
                    حسابك الأساسيَّة (الاسم والبريد الإلكتروني وصورة الملف الشَّخصي) وِفقًا لإعدادات
                    الخُصوصيَّة في حسابك على Google.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/40 bg-muted/40 p-5">
                  <h3 className="mb-2 flex items-center gap-2.5 text-lg font-bold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                      ج
                    </span>
                    إلغاء الحساب
                  </h3>
                  <p className="text-muted-foreground">
                    يمكنك طلب إلغاء حسابك في أيِّ وقت عن طريق التَّواصل معنا عبر البريد الإلكتروني.
                    سنقوم بمعالجة طلبك خلال يومًا.
                  </p>
                </div>
              </div>
            </section>

            {/* 04. استخدام الخدمات */}
            <section
              id="section-4"
              className="group rounded-3xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 font-bold text-destructive">
                  04
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. استخدام الخدمات</h2>
              </div>

              <p className="mb-4 font-semibold text-destructive">
                يُحظَر عليك عند استخدام خدماتنا:
              </p>

              <ul className="grid grid-cols-1 gap-2.5">
                {[
                  'انتهاك القوانين أو اللوائح المعمول بها',
                  'استخدام الخدمات لأغراض احتياليَّة أو غير قانونيَّة',
                  'محاولة الوصول غير المُصرَّح به إلى أنظمة أو حسابات أخرى',
                  'نشر محتوى ضار أو مُسيء أو مُخالف',
                  'تعطيل أو إعاقة عمل الخدمات أو الخوادم',
                  'جمع أو تخزين بيانات المستخدمين الآخرين بدون إذنهم',
                  'استخدام الخدمات للتَّنافس معنا بطريقة غير عادلة',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-card/90 p-3.5 text-muted-foreground shadow-2xs"
                  >
                    <svg
                      className="h-5 w-5 shrink-0 text-destructive"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 05. المحتوى والملكيَّة الفكريَّة */}
            <section
              id="section-5"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  05
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                  . المحتوى والملكيَّة الفكريَّة
                </h2>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border/40 bg-muted/40 p-5">
                  <h3 className="mb-2 flex items-center gap-2.5 text-lg font-bold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                      أ
                    </span>
                    محتوانا
                  </h3>
                  <p className="text-muted-foreground">
                    جميع المحتويات المتاحة على منصَّتنا (نصوص، صور، فيديوهات، تصاميم، شهادات، وأكواد
                    برمجيَّة) هي ملكيَّة فكريَّة خاصَّة برؤية رقمية أو مُورِّديها. لا يُسمَح بنسخ أو
                    تعديل أو توزيع أو إعادة استخدام أي محتوى دون إذن كتابي مُسبَق.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/40 bg-muted/40 p-5">
                  <h3 className="mb-2 flex items-center gap-2.5 text-lg font-bold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                      ب
                    </span>
                    محتواك
                  </h3>
                  <p className="text-muted-foreground">
                    تحتفظ بملكيَّة المحتوى الذي تُنشئه على منصَّتنا (مثل مقالات BlogPress). لكنَّك
                    تمنحنا ترخيصًا غير حصري لاستخدام وعرض هذا المحتوى لتشغيل الخدمات وتقديمها.
                  </p>
                </div>
              </div>
            </section>

            {/* 06. الدَّفع والاسترداد */}
            <section
              id="section-6"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  06
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                  . الدَّفع والاسترداد
                </h2>
              </div>

              <ul className="space-y-3">
                <li className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/40 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>
                    بعض الخدمات قد تتطلَّب أجرًا. تُوضَّح الأسعار بوضوح قبل إتمام أي عمليَّة شراء.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/40 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>
                    في حالة وجود سياسة استرداد مُحدَّدة لدورة أو خدمة مُعيَّنة، ستُعرَض عند
                    الشِّراء.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/40 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>نحتفظ بحقِّ تغيير الأسعار مع إخطار مُسبَق عبر الموقع.</span>
                </li>
              </ul>
            </section>

            {/* 07. إخلاء المسؤوليَّة */}
            <section
              id="section-7"
              className="group rounded-3xl border border-warning/30 bg-warning/5 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 font-bold text-warning">
                  07
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                  . إخلاء المسؤوليَّة
                </h2>
              </div>

              <ul className="space-y-3">
                <li className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-card/90 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>
                    تُقدَّم الخدمات &quot;كما هي&quot; و&quot;كما هي متاحة&quot; دون ضمانات صريحة أو
                    ضمنيَّة.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-card/90 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>لا نضمن أنَّ الخدمات ستكون غير منقطعة أو خالية من الأخطاء.</span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-card/90 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>
                    لا نتحمَّل المسؤوليَّة عن أيِّ أضرار غير مباشرة أو عرضيَّة أو تبعيَّة ناتجة عن
                    استخدام الخدمات.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-card/90 p-4">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>
                    مسؤوليَّتنا الإجماليَّة لن تتجاوز المبالغ التي دفعتها فعليًّا لنا خلال الاثني
                    عشر () شهرًا السَّابقة للحدث المُسبِّب للمسؤوليَّة.
                  </span>
                </li>
              </ul>
            </section>

            {/* 08. تعديلات الشُّروط */}
            <section
              id="section-8"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  08
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                  . تعديلات الشُّروط
                </h2>
              </div>
              <p className="text-muted-foreground">
                نحتفظ بحقِّ تعديل هذه الشُّروط في أيِّ وقت. سنُعلن عن التَّعديلات الجوهريَّة عبر
                الموقع أو عبر البريد الإلكتروني. استمرارك في استخدام الخدمات بعد أيِّ تعديلات
                يُشكِّل قبولًا لها.
              </p>
            </section>

            {/* 09. الإنهاء */}
            <section
              id="section-9"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  09
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. الإنهاء</h2>
              </div>
              <p className="text-muted-foreground">
                يمكننا تعليق أو إنهاء حسابك أو وصولك إلى الخدمات في أيِّ وقت، سواءً بسبب انتهاك هذه
                الشُّروط أو لأيِّ سببٍ آخر، مع أو بدون إخطار مُسبَق.
              </p>
            </section>

            {/* 10. القانون الحاكم */}
            <section
              id="section-10"
              className="group rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 font-bold text-primary">
                  10
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. القانون الحاكم</h2>
              </div>
              <p className="text-muted-foreground">
                تخضع هذه الشُّروط لقوانين الجمهوريَّة العربيَّة السُّوريَّة. أي نزاعات ناشئة عن هذه
                الشُّروط أو استخدام الخدمات تخضع للاختصاص القضائي الحصري لمحاكم حلب، سوريا.
              </p>
            </section>

            {/* 11. التَّواصل معنا */}
            <section
              id="section-11"
              className="group rounded-3xl border border-primary/30 bg-linear-to-br from-primary/10 via-card to-primary/5 p-6 shadow-sm transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:shadow-md sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground shadow-sm">
                  11
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">. التَّواصل معنا</h2>
              </div>

              <p className="mb-6 text-muted-foreground">
                لأيِّ استفسارات أو طلبات تتعلَّق بشُروط الاستخدام هذه، يُرجَى التَّواصل عبر:
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 rounded-2xl border border-border/50 bg-card/90 p-4 shadow-2xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 hover:border-primary/50">
                  <span className="text-xs font-medium text-muted-foreground">
                    البريد الإلكتروني
                  </span>
                  <a
                    href="mailto:contact@royaraqamia.com"
                    className="flex items-center gap-2 text-base font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    <span>contact@royaraqamia.com</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </a>
                </div>

                <div className="flex flex-col gap-1.5 rounded-2xl border border-border/50 bg-card/90 p-4 shadow-2xs transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 hover:border-primary/50">
                  <span className="text-xs font-medium text-muted-foreground">
                    الموقع الإلكتروني
                  </span>
                  <a
                    href="https://royaraqamia.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-base font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    <span>https://royaraqamia.com</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

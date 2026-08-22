import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سياسة الخصوصيَّة',
  description:
    'سياسة الخصوصيَّة لـ رؤية رقمية – تعرَّف على كيفيَّة جمع واستخدام وحماية معلوماتك الشَّخصيَّة.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'سياسة الخصوصيَّة | رؤية رقمية',
    description:
      'سياسة الخصوصيَّة لـ رؤية رقمية – تعرَّف على كيفيَّة جمع واستخدام وحماية معلوماتك الشَّخصيَّة.',
    url: '/privacy',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'سياسة الخصوصيَّة' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'سياسة الخصوصيَّة | رؤية رقمية',
    description:
      'سياسة الخصوصيَّة لـ رؤية رقمية – تعرَّف على كيفيَّة جمع واستخدام وحماية معلوماتك الشَّخصيَّة.',
    images: ['/OG Image.webp'],
  },
};

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen font-sans selection:bg-primary/20 relative overflow-hidden"
      dir="rtl"
    >
      {/* Subtle Ambient Radial Lighting Effects */}
      <div className="absolute top-0 right-1/2 translate-x-1/2 w-200 sm:w-300 h-125 bg-linear-to-b from-primary/10 via-fuchsia-500/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-100 h-100 bg-primary/5 glow-blur-lg pointer-events-none -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(#262626_1px,transparent_1px)] bg-size-[24px_24px] opacity-30 pointer-events-none -z-10" />

      <main className="cv-auto max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
        {/* Hero Header */}
        <header className="mb-10 sm:mb-14 border-b border-border/50 pb-8 sm:pb-12">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground mb-4 leading-tight">
            سياسة الخصوصيَّة
          </h1>
        </header>

        {/* Content Stream */}
        <div className="space-y-8 sm:space-y-10">
          {/* Section 01 */}
          <section
            id="intro"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                01
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">. المُقدِّمة</h2>
            </div>
            <p className="text-foreground/80 text-base sm:text-lg leading-relaxed">
              مرحبًا بك في <strong className="text-foreground font-semibold">رؤية رقمية</strong>{' '}
              (&quot;نحن&quot; أو &quot;المُشغِّل&quot;). نُقدِّر ثقتك بنا. تشرح هذه السِّياسة
              كيفيَّة جمع معلوماتك الشَّخصيَّة واستخدامها وحمايتها عند استخدامك لمواقعنا وخدماتنا
              إلكترونيًّا.
            </p>
          </section>

          {/* Section 02 */}
          <section
            id="collected-data"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                02
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                . المعلومات التي نجمعها
              </h2>
            </div>

            <div className="space-y-6">
              {/* Card 2.A */}
              <div className="rounded-xl border border-border/40 bg-muted/30 p-5 sm:p-6 transition-colors hover:border-primary/30">
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="text-primary font-mono">أ)</span> معلومات التَّسجيل والدُّخول
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base mb-4">
                  عند إنشاء حساب أو تسجيل الدُّخول، نجمع:
                </p>
                <ul className="space-y-2.5">
                  {[
                    'الاسم الكامل',
                    'البريد الإلكتروني',
                    'كلمة المرور المُشفَّرة (لا نُخزِّن كلمات المرور بنسختها الأصليَّة)',
                  ].map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-foreground/80 text-sm sm:text-base"
                    >
                      <svg
                        className="w-5 h-5 text-primary mt-0.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card 2.B */}
              <div className="rounded-xl border border-border/40 bg-muted/30 p-5 sm:p-6 transition-colors hover:border-primary/30">
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="text-primary font-mono">ب)</span> معلومات الدُّخول عبر Google
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base mb-4">
                  عند اختيار تسجيل الدُّخول باستخدام حساب Google، نتلقَّى المعلومات التَّالية من
                  Google وِفقًا لتصريح خصوصيَّتك في حسابك:
                </p>
                <ul className="space-y-2.5 mb-4">
                  {[
                    'الاسم الكامل المرتبط بحساب Google',
                    'عنوان البريد الإلكتروني',
                    'صورة الملف الشَّخصي (إن وُجِدت)',
                  ].map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-foreground/80 text-sm sm:text-base"
                    >
                      <svg
                        className="w-5 h-5 text-primary mt-0.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-xs sm:text-sm text-primary/90 leading-relaxed">
                  نستخدم هذه المعلومات فقط لأغراض المُصادقة وإنشاء حسابك على منصَّتنا. لن نُشارك هذه
                  المعلومات مع Google أو أي طرف ثالث لأغراض تسويقيَّة.
                </div>
              </div>

              {/* Card 2.C */}
              <div className="rounded-xl border border-border/40 bg-muted/30 p-5 sm:p-6 transition-colors hover:border-primary/30">
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="text-primary font-mono">ج)</span> معلومات الاستخدام
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base mb-4">
                  قد نجمع تلقائيًّا معلومات معيَّنة عند استخدامك للمنصَّة، منها:
                </p>
                <ul className="space-y-2.5">
                  {[
                    'عنوان IP',
                    'نوع المتصفِّح ونظام التَّشغيل',
                    'صفحات الموقع التي تزورها ووقت الزِّيارة',
                    'البيانات التي تُدخلها في نماذج التَّواصل',
                  ].map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-foreground/80 text-sm sm:text-base"
                    >
                      <svg
                        className="w-5 h-5 text-primary mt-0.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Section 03 */}
          <section
            id="data-usage"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                03
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                . كيفيَّة استخدام معلوماتك
              </h2>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base mb-6">
              نستخدم المعلومات التي نجمعها للأغراض التَّالية:
            </p>
            <div className="grid sm:grid-cols-2 gap-3.5">
              {[
                'توفير وتشغيل خدماتنا (الدَّورات التَّدريبيَّة، الشَّهادات، التَّطبيقات)',
                'المُصادقة وتأمين حسابك',
                'التَّواصل معك بخصوص حسابك أو خدماتنا',
                'تحسين تجربتك على المنصَّة',
                'الامتثال للالتزامات القانونيَّة',
                'منع الاحتيال وسوء الاستخدام',
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border/40 bg-muted/20 text-foreground/80 text-sm sm:text-base"
                >
                  <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 04 */}
          <section
            id="third-parties"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                04
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                . مشاركة المعلومات مع أطراف ثالثة
              </h2>
            </div>
            <p className="text-foreground/80 text-base sm:text-lg mb-6 leading-relaxed">
              نحنُ لا نبيع معلوماتك الشَّخصيَّة لأيِّ طرفٍ ثالث. قد نُشارك معلوماتك فقط في الحالات
              التَّالية:
            </p>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/30 p-5 leading-relaxed">
                <strong className="text-foreground block mb-2 text-base">مُزوِّدو الخدمات:</strong>
                <span className="text-foreground/80 text-sm sm:text-base">
                  نستخدم خدمات مُزوِّدين موثوقين مثل{' '}
                  <span className="text-primary font-medium">Supabase</span> (لتخزين البيانات
                  والمُصادقة) و <span className="text-primary font-medium">Vercel</span> (لاستضافة
                  الموقع) و <span className="text-primary font-medium">Resend</span> (لإرسال رسائل
                  البريد الإلكتروني). تُخزَّن هذه البيانات على خوادمهم بما يتوافق مع معايير الأمان.
                </span>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/30 p-5 leading-relaxed">
                <strong className="text-foreground block mb-2 text-base">
                  الالتزامات القانونيَّة:
                </strong>
                <span className="text-foreground/80 text-sm sm:text-base">
                  قد نكشف معلوماتك إذا طُلِب ذلك قانونيًّا أو ردًّا على إجراءات قانونيَّة صالحة.
                </span>
              </div>
            </div>
          </section>

          {/* Section 05 */}
          <section
            id="security"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                05
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">. الأمان والتَّخزين</h2>
            </div>
            <div className="space-y-3">
              {[
                'نتَّبع إجراءات أمنيَّة معقولة لحماية معلوماتك من الوصول غير المُصرَّح به أو استخدامها أو تعديلها أو إتلافها.',
                'تُخزَّن بياناتك على خوادم مُزوِّدي الخدمات الموثوقين مع تشفير أثناء النَّقل (TLS/SSL) وعند التَّخزين.',
                'نحتفظ بمعلوماتك الشَّخصيَّة فقط للمدَّة اللازمة لتحقيق الأغراض التي جُمِعت من أجلها، أو كما يقتضي القانون.',
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-muted/20 text-foreground/80 text-sm sm:text-base"
                >
                  <svg
                    className="w-5 h-5 text-primary shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 06 */}
          <section
            id="rights"
            className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                06
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">. حقوقك</h2>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base mb-6">
              لك حقوق فيما يتعلَّق بمعلوماتك الشَّخصيَّة:
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {[
                {
                  title: 'حقُّ الوصول:',
                  desc: 'يمكنك طلب نسخة من معلوماتك الشَّخصيَّة المُخزَّنة لدينا.',
                },
                { title: 'حقُّ التَّصحيح:', desc: 'يمكنك طلب تصحيح أي معلومات غير دقيقة.' },
                {
                  title: 'حقُّ الحذف:',
                  desc: 'يمكنك طلب حذف معلوماتك الشَّخصيَّة، شريطة أن لا يكون لدينا التزام قانوني للاحتفاظ بها.',
                },
                {
                  title: 'حقُّ الاعتراض:',
                  desc: 'يمكنك الاعتراض على معالجة معلوماتك في ظروف مُعيَّنة.',
                },
              ].map((right, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/40 bg-muted/30 p-4 leading-relaxed"
                >
                  <strong className="text-foreground block mb-1 text-sm sm:text-base">
                    {right.title}
                  </strong>
                  <p className="text-muted-foreground text-xs sm:text-sm">{right.desc}</p>
                </div>
              ))}
            </div>

            <p className="text-foreground/80 text-sm sm:text-base pt-4 border-t border-border/50">
              لممارسة أيٍّ من هذه الحقوق، يُرجَى التَّواصل معنا عبر البريد الإلكتروني:{' '}
              <a
                href="mailto:contact@royaraqamia.com"
                className="inline-flex items-center gap-1 text-primary font-medium underline underline-offset-4 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                contact@royaraqamia.com
              </a>
            </p>
          </section>

          {/* Section 07 & 08 Dual Grid Layout */}
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Section 07 */}
            <section className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                  07
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-foreground">
                  . ملفَّات تعريف الارتباط (Cookies)
                </h2>
              </div>
              <p className="text-foreground/80 text-sm sm:text-base leading-relaxed">
                نستخدم ملفَّات تعريف الارتباط الضَّروريَّة لتشغيل الموقع وتأمين الجلسات. لا نستخدم
                ملفَّات تعريف ارتباط التَّتبُّع لأغراض تحليليَّة أو تسويقيَّة.
              </p>
            </section>

            {/* Section 08 */}
            <section className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                  08
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-foreground">. خصوصيَّة الأحداث</h2>
              </div>
              <p className="text-foreground/80 text-sm sm:text-base leading-relaxed">
                قد تتمُّ معالجة بعض بياناتك من خلال خدمات مُزوِّدين مثل Vercel Analytics وSentry
                لتحسين أداء الموقع واكتشاف الأخطاء. تُعالج هذه البيانات بشكل مُجمَّع وغير مُحدَّد
                الهويَّة.
              </p>
            </section>
          </div>

          {/* Section 09 & 10 Dual Grid Layout */}
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Section 09 */}
            <section className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                  09
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-foreground">. الأطفال</h2>
              </div>
              <p className="text-foreground/80 text-sm sm:text-base leading-relaxed">
                خدماتنا غير مُوجَّهة لأقل من عامًا. لا نجمع عن عمد معلومات شخصيَّة من الأطفال. إذا
                علمنا أنَّنا جمعنا معلومات من طفل دون عامًا، سنقوم بمحو هذه المعلومات فورًا.
              </p>
            </section>

            {/* Section 10 */}
            <section className="group rounded-2xl sm:rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-8 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
                  10
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-foreground">
                  . التَّغييرات على هذه السِّياسة
                </h2>
              </div>
              <p className="text-foreground/80 text-sm sm:text-base leading-relaxed">
                قد نُحدِّث هذه السِّياسة من وقت لآخر. سنُعلن عن أي تغييرات جوهريَّة عبر الموقع أو
                عبر البريد الإلكتروني. نُشجِّعك على مراجعة هذه السِّياسة بانتظام.
              </p>
            </section>
          </div>

          {/* Section 11 - Contact CTA Section */}
          <section
            id="contact"
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-primary/30 bg-linear-to-br from-card via-card/90 to-primary/10 p-6 sm:p-10 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-mono font-bold">
                11
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">. التَّواصل معنا</h2>
            </div>
            <p className="text-foreground/80 text-sm sm:text-base mb-6 leading-relaxed">
              لأيِّ استفسارات أو طلبات تتعلَّق بسياسة الخصوصيَّة هذه، يُرجَى التَّواصل عبر:
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <a
                href="mailto:contact@royaraqamia.com"
                className="group flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/30 hover:border-primary/50 hover:bg-card/70 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block">البريد الإلكتروني</span>
                  <span className="text-sm sm:text-base text-foreground font-medium group-hover:text-primary transition-colors">
                    contact@royaraqamia.com
                  </span>
                </div>
                <svg
                  className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </a>

              <a
                href="https://royaraqamia.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/30 hover:border-primary/50 hover:bg-card/70 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block">الموقع الإلكتروني</span>
                  <span className="text-sm sm:text-base text-foreground font-medium group-hover:text-primary transition-colors">
                    https://royaraqamia.com
                  </span>
                </div>
                <svg
                  className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

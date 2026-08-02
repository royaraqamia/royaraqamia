import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سياسة الأمان والإبلاغ عن الثغرات',
  description:
    'سياسة الأمان والإبلاغ عن الثغرات في منصَّة رؤية رقمية – كيفيَّة الإبلاغ عن الثغرات الأمنيَّة بطريقة مسؤولة.',
  alternates: { canonical: '/security' },
  openGraph: {
    title: 'سياسة الأمان والإبلاغ عن الثغرات | رؤية رقمية',
    description:
      'سياسة الأمان والإبلاغ عن الثغرات في منصَّة رؤية رقمية – كيفيَّة الإبلاغ عن الثغرات الأمنيَّة بطريقة مسؤولة.',
    url: '/security',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'سياسة الأمان' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'سياسة الأمان والإبلاغ عن الثغرات | رؤية رقمية',
    description:
      'سياسة الأمان والإبلاغ عن الثغرات في منصَّة رؤية رقمية – كيفيَّة الإبلاغ عن الثغرات الأمنيَّة بطريقة مسؤولة.',
    images: ['/OG Image.webp'],
  },
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:py-20" dir="rtl">
      <header className="mb-10">
        <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">سياسة الأمان</h1>
        <p className="text-muted-foreground text-sm">آخر تحديث: آب 2026</p>
      </header>

      <div className="space-y-8 text-base leading-relaxed text-foreground/90">
        <section>
          <h2 className="mb-3 text-xl font-bold">. الإبلاغ عن الثغرات الأمنيَّة</h2>
          <p>
            تأخذ <strong>رؤية رقمية</strong> أمان منصَّتها على محمل الجد. إذا اكتشفت ثغرة أمنيَّة،
            يُرجى الإبلاغ عنها <strong>بشكل مسؤول</strong> وعدم نشرها علنًا قبل معالجتها.
          </p>
          <ul className="list-disc space-y-1 pr-6">
            <li>
              أرسل تقريرك إلى:{' '}
              <a
                href="mailto:contact@royaraqamia.com?subject=%5BSECURITY%5D"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                contact@royaraqamia.com
              </a>
            </li>
            <li>اجعل عنوان الرسالة يبدأ بالبادئة: [SECURITY]</li>
            <li>قدّم، إن أمكن: خطوات إعادة الإنتاج، الأثر المحتمل، والاقتراح العلاجي إن وُجد.</li>
            <li>لا تشارك بيانات مستخدمين حقيقيين داخل التقرير.</li>
          </ul>
          <p className="mt-3">
            نتعهد بتأكيد استلام التقرير خلال <strong>48 ساعة</strong>، وتقديم تحديث عن الحالة خلال{' '}
            <strong>5 أيام عمل</strong>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. نطاق التغطية</h2>
          <ul className="list-disc space-y-1 pr-6">
            <li>التنفيذ البرمجي عن بُعد (RCE)</li>
            <li>حقن البرمجة النصيَّة عبر المواقع (XSS)</li>
            <li>تزوير الطلبات عبر المواقع (CSRF)</li>
            <li>تجاوز المصادقة أو التَّفويض</li>
            <li>كشف البيانات الحسّاسة</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. خارج النطاق</h2>
          <ul className="list-disc space-y-1 pr-6">
            <li>الثغرات في المكتبات الخارجيَّة التي تغطيها برامج الإفصاح الخاصة بها.</li>
            <li>هجمات الهندسة الاجتماعيَّة ضد المُشغِّل.</li>
            <li>تعرُّض ذاتي (Self-XSS) دون أثر مثبَت.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. حماية البيانات</h2>
          <p>
            نلتزم بحماية بياناتك الشخصيَّة وفق أفضل الممارسات: التشفير أثناء النقل (HTTPS/TLS) وعند
            الخزّن، وتطبيق مبدأ الحدّ الأدنى من جمع البيانات، واحترام حقوق الوصول والتصحيح والحذف.
            للمزيد، راجع{' '}
            <a
              href="/privacy"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              سياسة الخصوصيَّة
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. التواصل</h2>
          <p>
            للاستفسارات الأمنيَّة أو الإبلاغ عن ثغرة:{' '}
            <a
              href="mailto:contact@royaraqamia.com?subject=%5BSECURITY%5D"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              contact@royaraqamia.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}

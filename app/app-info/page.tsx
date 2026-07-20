import type { Metadata } from 'next';
import Link from 'next/link';
import { LazyImage } from '../../components/LazyImage';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';

export const metadata: Metadata = {
  title: 'معلومات المنصَّة | رؤية رقمية',
  description: 'معلومات عن منصَّة رؤية رقمية – وصف الخدمات وغرض استخدام معلومات حساب Google.',
  alternates: { canonical: '/app-info' },
};

export default function AppInfoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24" dir="rtl">
        <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
          <header className="mb-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 relative flex-shrink-0">
                <LazyImage
                  src="/logo.png"
                  webpSrc="/logo.webp"
                  alt="رؤية رقمية"
                  width={64}
                  height={64}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">رؤية رقمية</h1>
                <p className="text-muted-foreground text-sm">منصَّة التدريب والتطوير الرقمي</p>
              </div>
            </div>
          </header>

          <div className="space-y-8 text-base leading-relaxed text-foreground/90">
            <section>
              <h2 className="mb-3 text-xl font-bold">عن المنصَّة</h2>
              <p>
                <strong>رؤية رقمية</strong> منصَّة عربيَّة متخصِّصة في التدريب والتطوير الرقمي.
                نُقدِّم خدمات متكاملة تشمل:
              </p>
              <ul className="list-disc space-y-1 pr-6 mt-3">
                <li>
                  <strong>دورات تدريبيَّة احترافيَّة:</strong> مسارات تعليميَّة شاملة لبناء المواقع
                  الإلكترونيَّة وتطبيقات الويب، مُوجَّهة للطُّلاب والخرِّيجين الجدد.
                </li>
                <li>
                  <strong>استشارات تقنيَّة:</strong> جلسات استشاريَّة فرديَّة لمساعدة أصحاب الأعمال
                  والطُّلاب في اتِّخاذ قرارات تقنيَّة صحيحة.
                </li>
                <li>
                  <strong>تطوير مواقع وتطبيقات:</strong> بناء حلول رقميَّة متكاملة من الألف إلى
                  الياء للمؤسَّسات وأصحاب الأعمال.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">لماذا نستخدم تسجيل الدُّخول عبر Google؟</h2>
              <p>
                نوفِّر تسجيل الدُّخول عبر Google كبديل مريح وآمن لإنشاء الحساب والدُّخول إلى
                المنصَّة. يُتيح ذلك للمستخدمين:
              </p>
              <ul className="list-disc space-y-1 pr-6 mt-3">
                <li>الوصول الفوري إلى حسابهم دون الحاجة لإنشاء كلمة مرور إضافيَّة.</li>
                <li>التسجيل في الدورات التدريبيَّة وتتبُّع تقدُّمهم التعليمي.</li>
                <li>إدارة حسابهم والوصول إلى شهاداتهم وخدماتهم.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">المعلومات التي نطلبها من Google</h2>
              <p>
                عند تسجيل الدُّخول عبر Google، نتلقى المعلومات التالية من حسابك وفقًا لتصريح
                خصوصيَّتك:
              </p>
              <ul className="list-disc space-y-1 pr-6 mt-3">
                <li>
                  <strong>الاسم الكامل</strong> – لعرضه في حسابك على المنصَّة.
                </li>
                <li>
                  <strong>البريد الإلكتروني</strong> – لإنشاء حسابك والتواصل معك بخصوص دوراتك
                  وخدماتنا.
                </li>
                <li>
                  <strong>صورة الملف الشخصي</strong> – لعرضها في ملفَّك الشخصي على المنصَّة (إن
                  وُجدت).
                </li>
              </ul>
              <p className="mt-3">
                نستخدم هذه المعلومات <strong>فقط</strong> لأغراض المُصادقة وإدارة حسابك. لن نُشاركها
                مع Google أو أي طرف ثالث لأغراض تسويقيَّة.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">سِياسة الخُصوصيَّة</h2>
              <p>
                للاطِّلاع على تفاصيل كاملة حول كيفيَّة جمع بياناتك واستخدامها وحمايتها، يُرجى مراجعة
                سِياسة الخُصوصيَّة الخاصة بنا:
              </p>
              <Link
                href="/privacy"
                className="text-primary underline underline-offset-4 hover:text-primary/80 mt-2 inline-block"
              >
                سِياسة الخُصوصيَّة
              </Link>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">التواصل معنا</h2>
              <p>لأي استفسارات تتعلق بالمنصَّة أو استخدام معلوماتك، يُرجى التواصل عبر:</p>
              <ul className="list-disc space-y-1 pr-6">
                <li>
                  البريد الإلكتروني:{' '}
                  <a
                    href="mailto:contact@royaraqamia.com"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    contact@royaraqamia.com
                  </a>
                </li>
                <li>الموقع الإلكتروني: https://royaraqamia.com</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

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
    <div className="mx-auto max-w-3xl px-6 py-12 md:py-20" dir="rtl">
      <header className="mb-10">
        <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">سياسة الخصوصيَّة</h1>
        <p className="text-muted-foreground text-sm">آخر تحديث: 19 صَفَر 1448 هـ</p>
      </header>

      <div className="space-y-8 text-base leading-relaxed text-foreground/90">
        <section>
          <h2 className="mb-3 text-xl font-bold">. المُقدِّمة</h2>
          <p>
            مرحبًا بك في <strong>رؤية رقمية</strong> (&quot;نحن&quot; أو &quot;المُشغِّل&quot;).
            نُقدِّر ثقتك بنا. تشرح هذه السِّياسة كيفيَّة جمع معلوماتك الشَّخصيَّة واستخدامها
            وحمايتها عند استخدامك لمواقعنا وخدماتنا إلكترونيًّا.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. المعلومات التي نجمعها</h2>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">أ) معلومات التَّسجيل والدُّخول</h3>
            <p>عند إنشاء حساب أو تسجيل الدُّخول، نجمع:</p>
            <ul className="list-disc space-y-1 pr-6">
              <li>الاسم الكامل</li>
              <li>البريد الإلكتروني</li>
              <li>كلمة المرور المُشفَّرة (لا نُخزِّن كلمات المرور بنسختها الأصليَّة)</li>
            </ul>

            <h3 className="text-lg font-semibold">ب) معلومات الدُّخول عبر Google</h3>
            <p>
              عند اختيار تسجيل الدُّخول باستخدام حساب Google، نتلقَّى المعلومات التَّالية من Google
              وِفقًا لتصريح خصوصيَّتك في حسابك:
            </p>
            <ul className="list-disc space-y-1 pr-6">
              <li>الاسم الكامل المرتبط بحساب Google</li>
              <li>عنوان البريد الإلكتروني</li>
              <li>صورة الملف الشَّخصي (إن وُجِدت)</li>
            </ul>
            <p>
              نستخدم هذه المعلومات فقط لأغراض المُصادقة وإنشاء حسابك على منصَّتنا. لن نُشارك هذه
              المعلومات مع Google أو أي طرف ثالث لأغراض تسويقيَّة.
            </p>

            <h3 className="text-lg font-semibold">ج) معلومات الاستخدام</h3>
            <p>قد نجمع تلقائيًّا معلومات معيَّنة عند استخدامك للمنصَّة، منها:</p>
            <ul className="list-disc space-y-1 pr-6">
              <li>عنوان IP</li>
              <li>نوع المتصفِّح ونظام التَّشغيل</li>
              <li>صفحات الموقع التي تزورها ووقت الزِّيارة</li>
              <li>البيانات التي تُدخلها في نماذج التَّواصل</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. كيفيَّة استخدام معلوماتك</h2>
          <p>نستخدم المعلومات التي نجمعها للأغراض التَّالية:</p>
          <ul className="list-disc space-y-1 pr-6">
            <li>توفير وتشغيل خدماتنا (الدَّورات التَّدريبيَّة، الشَّهادات، التَّطبيقات)</li>
            <li>المُصادقة وتأمين حسابك</li>
            <li>التَّواصل معك بخصوص حسابك أو خدماتنا</li>
            <li>تحسين تجربتك على المنصَّة</li>
            <li>الامتثال للالتزامات القانونيَّة</li>
            <li>منع الاحتيال وسوء الاستخدام</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. مشاركة المعلومات مع أطراف ثالثة</h2>
          <p>
            نحنُ لا نبيع معلوماتك الشَّخصيَّة لأيِّ طرفٍ ثالث. قد نُشارك معلوماتك فقط في الحالات
            التَّالية:
          </p>
          <ul className="list-disc space-y-1 pr-6">
            <li>
              <strong>مُزوِّدو الخدمات:</strong> نستخدم خدمات مُزوِّدين موثوقين مثل Supabase (لتخزين
              البيانات والمُصادقة) و Vercel (لاستضافת الموقع) و Resend (لإرسال رسائل البريد
              الإلكتروني). تُخزَّن هذه البيانات على خوادمهم بما يتوافق مع معايير الأمان.
            </li>
            <li>
              <strong>الالتزامات القانونيَّة:</strong> قد نكشف معلوماتك إذا طُلِب ذلك قانونيًّا أو
              ردًّا على إجراءات قانونيَّة صالحة.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. الأمان والتَّخزين</h2>
          <ul className="list-disc space-y-1 pr-6">
            <li>
              نتَّبع إجراءات أمنيَّة معقولة لحماية معلوماتك من الوصول غير المُصرَّح به أو استخدامها
              أو تعديلها أو إتلافها.
            </li>
            <li>
              تُخزَّن بياناتك على خوادم مُزوِّدي الخدمات الموثوقين مع تشفير أثناء النَّقل (TLS/SSL)
              وعند التَّخزين.
            </li>
            <li>
              نحتفظ بمعلوماتك الشَّخصيَّة فقط للمدَّة اللازمة لتحقيق الأغراض التي جُمِعت من أجلها،
              أو كما يقتضي القانون.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. حقوقك</h2>
          <p>لك حقوق فيما يتعلَّق بمعلوماتك الشَّخصيَّة:</p>
          <ul className="list-disc space-y-1 pr-6">
            <li>
              <strong>حقُّ الوصول:</strong> يمكنك طلب نسخة من معلوماتك الشَّخصيَّة المُخزَّنة لدينا.
            </li>
            <li>
              <strong>حقُّ التَّصحيح:</strong> يمكنك طلب تصحيح أي معلومات غير دقيقة.
            </li>
            <li>
              <strong>حقُّ الحذف:</strong> يمكنك طلب حذف معلوماتك الشَّخصيَّة، شريطة أن لا يكون
              لدينا التزام قانوني للاحتفاظ بها.
            </li>
            <li>
              <strong>حقُّ الاعتراض:</strong> يمكنك الاعتراض على معالجة معلوماتك في ظروف مُعيَّنة.
            </li>
          </ul>
          <p>
            لممارسة أيٍّ من هذه الحقوق، يُرجَى التَّواصل معنا عبر البريد الإلكتروني:{' '}
            <a
              href="mailto:contact@royaraqamia.com"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              contact@royaraqamia.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. ملفَّات تعريف الارتباط (Cookies)</h2>
          <p>
            نستخدم ملفَّات تعريف الارتباط الضَّروريَّة لتشغيل الموقع وتأمين الجلسات. لا نستخدم
            ملفَّات تعريف ارتباط التَّتبُّع لأغراض تحليليَّة أو تسويقيَّة.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. خصوصيَّة الأحداث</h2>
          <p>
            قد تتمُّ معالجة بعض بياناتك من خلال خدمات مُزوِّدين مثل Vercel Analytics وSentry لتحسين
            أداء الموقع واكتشاف الأخطاء. تُعالج هذه البيانات بشكل مُجمَّع وغير مُحدَّد الهويَّة.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. الأطفال</h2>
          <p>
            خدماتنا غير مُوجَّهة لأقل من عامًا. لا نجمع عن عمد معلومات شخصيَّة من الأطفال. إذا علمنا
            أنَّنا جمعنا معلومات من طفل دون عامًا، سنقوم بمحو هذه المعلومات فورًا.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. التَّغييرات على هذه السِّياسة</h2>
          <p>
            قد نُحدِّث هذه السِّياسة من وقت لآخر. سنُعلن عن أي تغييرات جوهريَّة عبر الموقع أو عبر
            البريد الإلكتروني. نُشجِّعك على مراجعة هذه السِّياسة بانتظام.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">. التَّواصل معنا</h2>
          <p>لأيِّ استفسارات أو طلبات تتعلَّق بسياسة الخصوصيَّة هذه، يُرجَى التَّواصل عبر:</p>
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
  );
}

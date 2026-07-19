import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'شُروط الاستخدام | رؤية رقمية',
  description:
    'شُروط الاستخدام لمنصَّة رؤية رقمية – اقرأ الشُروط والالتزامات المتعلقة باستخدام خدماتنا.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <header className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">شُروط الاستخدام</h1>
          <p className="text-muted-foreground text-sm">آخر تحديث: ١٩ يوليوز ٢٠٢٦</p>
        </header>

        <div className="space-y-8 text-base leading-relaxed text-foreground/90">
          <section>
            <h2 className="mb-3 text-xl font-bold">١. المُقدِّمة</h2>
            <p>
              مرحبًا بك في منصَّة <strong>رؤية رقمية</strong> (&quot;نحن&quot; أو
              &quot;المُشغِّل&quot;). باستخدامك لمواقعنا وخدماتنا، فإنك توافق على الالتزام بهذه
              الشُروط. إذا لم توافق على أي من هذه الشُروط، يُرجى عدم استخدام خدماتنا.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٢. وصف الخدمات</h2>
            <p>
              تُقدِّم رؤية رقمية منصَّة تعليميَّة إلكترونيَّة تشمل الدورات التدريبيَّة والشهادات
              المعتمدة في مجالات تطوير المواقع والتصميم والتسويق الرقمي. كما نُقدِّم أدوات وتطبيقات
              مساعدة مثل:
            </p>
            <ul className="list-disc space-y-1 pr-6">
              <li>
                <strong>LinkSnap</strong> – أداة اختصار الروابط
              </li>
              <li>
                <strong>BlogPress</strong> – منصَّة إدارة المدوّنات
              </li>
              <li>
                <strong>HabitFlow</strong> – تطبيق إدارة العادات
              </li>
              <li>
                <strong>SpendTrack</strong> – تطبيق تتبع المصروفات
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٣. الحساب والمُصادقة</h2>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">أ) إنشاء الحساب</h3>
              <ul className="list-disc space-y-1 pr-6">
                <li>يجب أن يكون عمرك ١٣ عامًا على الأقل لإنشاء حساب.</li>
                <li>يجب تقديم معلومات دقيقة ومُحدَّثة أثناء التسجيل.</li>
                <li>أنت مسؤول عن الحفاظ على سرّيَّة كلمة المرور الخاصة بك.</li>
                <li>أنت مسؤول عن جميع الأنشطة التي تتم تحت حسابك.</li>
              </ul>

              <h3 className="text-lg font-semibold">ب) الدُّخول عبر Google</h3>
              <p>
                عند استخدام ميزة الدُّخول بحساب Google، أنت تمنحنا إذنًا بالوصول إلى معلومات حسابك
                الأساسيَّة (الاسم والبريد الإلكتروني وصورة الملف الشخصي) وفقًا لإعدادات الخُصوصيَّة
                في حسابك على Google.
              </p>

              <h3 className="text-lg font-semibold">ج) إلغاء الحساب</h3>
              <p>
                يمكنك طلب إلغاء حسابك في أي وقت عن طريق التواصل معنا عبر البريد الإلكتروني. سنقوم
                بمعالجة طلبك خلال ٣٠ يومًا.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٤. استخدام الخدمات</h2>
            <p>يُحظر عليك عند استخدام خدماتنا:</p>
            <ul className="list-disc space-y-1 pr-6">
              <li>انتهاك القوانين أو اللوائح المعمول بها</li>
              <li>استخدام الخدمات لأغراض احتياليَّة أو غير قانونيَّة</li>
              <li>محاولة الوصول غير المصرَّح به إلى أنظمة أو حسابات أخرى</li>
              <li>نشر محتوى ضار أو مُسيء أو مُخالف</li>
              <li>تعطيل أو إعاقة عمل الخدمات أو الخوادم</li>
              <li>جمع أو تخزين بيانات المستخدمين الآخرين بدون إذنهم</li>
              <li>استخدام الخدمات للتنافس معنا بطريقة غير عادلة</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٥. المحتوى والملكية الفكريَّة</h2>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">أ) محتوانا</h3>
              <p>
                جميع المحتويات المتاحة على منصَّتنا (نصوص، صور، فيديوهات، تصاميم، شهادات، وأكواد
                برمجيَّة) هي ملكيَّة فكريَّة خاصة برؤية رقمية أو مورِّديها. لا يُسمح بنسخ أو تعديل
                أو توزيع أو إعادة استخدام أي محتوى دون إذن كتابي مسبق.
              </p>

              <h3 className="text-lg font-semibold">ب) محتواك</h3>
              <p>
                تحتفظ بملكيَّة المحتوى الذي تنشئه على منصَّتنا (مثل مقالات BlogPress). لكنك تمنحنا
                ترخيصًا غير حصري لاستخدام وعرض هذا المحتوى لتشغيل الخدمات وتقديمها.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٦. الدفع والاسترداد</h2>
            <ul className="list-disc space-y-1 pr-6">
              <li>بعض الخدمات قد تتطلّب أجرًا. تُوضَّح الأسعار بوضوح قبل إتمام أي عملية شراء.</li>
              <li>في حالة وجود سياسة استرداد محددة لدورة أو خدمة معينة، ستُعرض عند الشراء.</li>
              <li>نحتفظ بحق تغيير الأسعار مع إخطار مسبق عبر الموقع.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٧. إخلاء المسؤوليَّة</h2>
            <ul className="list-disc space-y-1 pr-6">
              <li>
                تُقدَّم الخدمات &quot;كما هي&quot; و&quot;كما هي متاحة&quot; دون ضمانات صريحة أو
                ضمنيَّة.
              </li>
              <li>لا نضمن أن الخدمات ستكون غير منقطعة أو خالية من الأخطاء.</li>
              <li>
                لا نتحمَّل المسؤوليَّة عن أي أضرار غير مباشرَة أو عرضيَّة أو تبعيَّة ناتجة عن
                استخدام الخدمات.
              </li>
              <li>
                مسؤوليَّتنا الإجماليَّة لن تتجاوز المبالغ التي دفعتها فعليًا لنا خلال الاثني عشر
                (١٢) شهرًا السابقة للحدث المُسبِّب للمسؤوليَّة.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٨. تعديلات الشُروط</h2>
            <p>
              نحتفظ بحق تعديل هذه الشُروط في أي وقت. سنُعلن عن التعديلات الجوهرية عبر الموقع أو عبر
              البريد الإلكتروني. استمرارك في استخدام الخدمات بعد أي تعديلات يُشكِّل قبولًا لها.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">٩. الإنهاء</h2>
            <p>
              يمكننا تعليق أو إنهاء حسابك أو وصولك إلى الخدمات في أي وقت، سواء بسبب انتهاك هذه
              الشُروط أو لأي سبب آخر، مع أو بدون إخطار مسبق.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">١٠. القانون الحاكم</h2>
            <p>
              تخضع هذه الشُروط لقوانين الجمهوريَّة العربيَّة السورية. أي نزاعات ناشئة عن هذه الشُروط
              أو استخدام الخدمات تخضع للاختصاص القضائي الحصري لمحاكم حلب، سوريا.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">١١. التواصل معنا</h2>
            <p>لأي استفسارات أو طلبات تتعلق بشُروط الاستخدام هذه، يُرجى التواصل عبر:</p>
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
  );
}

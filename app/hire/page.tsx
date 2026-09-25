import { CheckCircle2 } from 'lucide-react';
import { RetainerRequestForm } from '@/frontend/ui/retainers/retainer-request-form';
import { RETAINER_DEFAULT_MONTHLY_FEE_USD } from '@/shared/contracts/retainers';

const PROMISES = [
  'وصف المشاريع التي تديرها اليوم',
  'تحديد ما تريد صيانته أو تطويره أو إدارته',
  'رقم طلب فوري لمتابعة اتفاقك',
];

export default function HirePage() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          <span className="bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-400 bg-clip-text text-transparent">
            اطلب التَّوظيف الشَّهريّ
          </span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
          نعتني بمشاريعك شهريًّا: صيانة، تطوير، وإدارة — من دون أن تبحث عن مطوِّر لكلِّ تعديل. لا
          حاجة إلى إنشاء حساب.
        </p>

        <p className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border border-purple-500/25 bg-purple-500/5 px-4 py-2.5 text-sm">
          <span className="font-bold text-foreground">
            الرَّسم الشَّهريّ: {RETAINER_DEFAULT_MONTHLY_FEE_USD}$ شهريًّا
          </span>
          <span className="text-muted-foreground">— يُدفع خارج الموقع.</span>
        </p>

        <ul className="mt-6 flex flex-col items-center gap-2.5 text-sm text-muted-foreground">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-purple-500" aria-hidden="true" />
              <span>{promise}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="نموذج التَّوظيف الشَّهريّ"
        className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm"
      >
        <RetainerRequestForm />
      </section>
    </div>
  );
}

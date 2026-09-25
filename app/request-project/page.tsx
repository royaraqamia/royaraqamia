import { CheckCircle2 } from 'lucide-react';
import { ProjectRequestForm } from '@/frontend/ui/project-requests/project-request-form';

const PROMISES = [
  'نوع المشروع: موقع، تطبيق، أو شيء آخر',
  'ميزانية ومدة متوقَّعة إن أردت تحديدهما',
  'رقم طلب فوري لمتابعة مشروعك',
];

export default function RequestProjectPage() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          <span className="bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-400 bg-clip-text text-transparent">
            اطلب بناء مشروعك
          </span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
          صف لنا المشروع الذي تريد بناءه، وسنعود إليك بعرض واضح. لا حاجة إلى إنشاء حساب.
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
        aria-label="نموذج طلب المشروع"
        className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm"
      >
        <ProjectRequestForm />
      </section>
    </div>
  );
}

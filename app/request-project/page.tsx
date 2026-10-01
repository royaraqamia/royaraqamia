import { Building2, MonitorSmartphone, Rocket, Wallet } from 'lucide-react';
import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { RequestProjectFlow } from '@/frontend/ui/project-requests/request-project-flow';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { PROJECT_REQUEST_WEBSITE_START_PRICE_USD } from '@/shared/contracts/project-requests';

const SUMMARY_ITEMS = [
  { icon: Building2, label: 'المزوِّد', value: SITE_NAME },
  { icon: MonitorSmartphone, label: 'نوع المشروع', value: 'موقع أو تطبيق' },
  { icon: Rocket, label: 'التَّسليم', value: 'خلال أسابيع' },
];

export default function RequestProjectPage() {
  return (
    <RequestProjectFlow
      summary={
        /* Project summary — the page's own pitch, server-rendered so it stays
           out of the client bundle. */
        <section
          aria-label="تفاصيل طلب المشروع"
          className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
        >
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            <span className="bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-400 bg-clip-text text-transparent">
              بناء مشروعك الرَّقمي
            </span>
          </h2>
          <CollapsibleText
            lines={2}
            className="mt-2 text-sm text-muted-foreground leading-relaxed"
            buttonClassName="text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
          >
            من صفحة تعريفيَّة واحدة إلى منصَّة كاملة: أخبرنا بفكرتك وهدفك، ونُحوِّلها إلى منتج يعمل
            ويحقِّق نتيجة. نبني مواقع وتطبيقات، والكود تملكه بالكامل. بعد إرسال الطَّلب نُراجع
            الفكرة ونبني عرضًا واضحًا بالنِّطاق والسِّعر، ثم نبدأ التنفيذ.
          </CollapsibleText>

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SUMMARY_ITEMS.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="truncate text-sm font-bold text-foreground">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-border/50 pt-5">
            <span className="text-xs font-medium text-muted-foreground">تبدأ من</span>
            <span className="text-2xl font-black tracking-tight text-foreground">
              {`$${PROJECT_REQUEST_WEBSITE_START_PRICE_USD}`}
            </span>
            <span className="text-xs text-muted-foreground">حسب نطاق المشروع</span>
            <span className="inline-flex items-center gap-1 self-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              الدَّفع بالتَّقسيط مُتاح
            </span>
          </div>
        </section>
      }
    />
  );
}

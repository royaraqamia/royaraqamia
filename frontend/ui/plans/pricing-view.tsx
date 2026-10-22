import Link from 'next/link';
import { Check, MessageCircle, Sparkles, Wallet } from 'lucide-react';

import { CurrentPlanNotice } from '@/frontend/ui/plans/current-plan-notice';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import type { PlanCatalog, UsageActionKey } from '@/shared/contracts/plans';

const FREE = 'free' as const;
const PRO = 'pro' as const;

function priceLabel(cents: number, currency: string): string {
  const amount = cents / 100;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
}

function capOf(catalog: PlanCatalog, key: string, plan: typeof FREE | typeof PRO): number {
  const limit = catalog.limits.find((entry) => entry.key === key);
  if (!limit) return 0;
  return plan === PRO ? limit.proCap : limit.freeCap;
}

function actionsFor(catalog: PlanCatalog, credits: number, key: UsageActionKey): number {
  const cost = catalog.costs.find((entry) => entry.actionKey === key)?.cost ?? 1;
  return Math.floor(credits / cost);
}

/**
 * The public pricing page. Every number comes from the plan catalog
 * (`plan_settings`, `plan_limits`, `usage_action_costs`), so the page cannot
 * promise an allowance the database does not enforce (ADR-0075).
 *
 * It is deliberately reachable without an account: the account row links here
 * for guests too, and a visitor has an allowance of their own.
 */
export function PricingView({ catalog }: { catalog: PlanCatalog }) {
  const { settings, limits, costs } = catalog;
  const free = settings.freeCredits;
  const pro = settings.proCredits;

  const postsFree = actionsFor(catalog, free, 'community.post.publish');
  const linksFree = actionsFor(catalog, free, 'linksnap.link.create');
  const downloadsFree = actionsFor(catalog, free, 'downloader.job.create');

  const postsPro = actionsFor(catalog, pro, 'community.post.publish');
  const linksPro = actionsFor(catalog, pro, 'linksnap.link.create');

  const subscribeMessage = `أريد الاشتراك في الخطة المدفوعة: ${priceLabel(
    settings.priceCents,
    settings.currency
  )} كل ${settings.durationDays} يوماً.`;

  return (
    <div className="space-y-10 pb-6 sm:space-y-12">
      <header className="text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>خطَّتان، وكل المنتجات في كلتيهما</SectionTitleHighlight>
        </SectionTitle>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty sm:text-base">
          كل ما في رؤيَة رَقَميَّة متاح لك على الخطَّتين. الفرق هو مقدار الاستخدام، لا ما تستطيع
          الوصول إليه.
        </p>
        <div className="mx-auto mt-5 max-w-2xl">
          <CurrentPlanNotice
            freeCredits={free}
            anonymousDailyCredits={settings.anonymousDailyCredits}
          />
        </div>
      </header>

      <section aria-label="الخطتان" className="grid gap-4 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-3xl border border-border/60 bg-card/80 p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-foreground">المجاني</h2>
            <span className="text-xs font-bold text-muted-foreground">دائماً</span>
          </div>

          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black tracking-tight text-foreground">$0</span>
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="font-bold text-foreground">{formatCount(free)}</strong> رصيداً كل{' '}
            {settings.windowDays} يوماً
          </p>

          <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
            <PlanPoint>
              حتى {formatCount(postsFree)} منشورات، أو {formatCount(linksFree)} رابطاً مختصراً، أو{' '}
              {formatCount(downloadsFree)} تنزيلاً — كلُّها من الرصيد نفسه.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'habits', FREE))} عادات، و
              {formatCount(capOf(catalog, 'short_links', FREE))} رابطاً محفوظاً.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'community_published', FREE))} منشوراً في المجتمع، و
              {formatCount(capOf(catalog, 'quran_bookmarks', FREE))} علامة في القرآن.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'mcp_connected_apps', FREE))} تطبيق MCP متَّصل.
            </PlanPoint>
            <PlanPoint>
              قراءة غير محدودة: المجتمع، القرآن، أسعار الصرف، التحقُّق من الشَّهادات.
            </PlanPoint>
          </ul>

          <Link
            href="/auth/signup"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full border border-input/80 bg-background/80 px-6 text-sm font-bold text-foreground transition-safe hover:bg-accent/80"
          >
            ابدأ مجاناً
          </Link>
        </div>

        {/* Paid */}
        <div className="relative flex flex-col rounded-3xl border border-primary/30 bg-linear-to-b from-primary/5 to-transparent p-6">
          <span className="absolute -top-3 start-6 rounded-full border border-primary/30 bg-background px-3 py-1 text-[11px] font-bold text-primary">
            الأكثر اختياراً
          </span>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-foreground">المدفوع</h2>
            <span className="text-xs font-bold text-muted-foreground">
              كل {settings.durationDays} يوماً
            </span>
          </div>

          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black tracking-tight text-foreground">
              {priceLabel(settings.priceCents, settings.currency)}
            </span>
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="font-bold text-foreground">{formatCount(pro)}</strong> رصيداً كل{' '}
            {settings.windowDays} يوماً
          </p>

          <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
            <PlanPoint>
              حتى {formatCount(postsPro)} منشوراً، أو {formatCount(linksPro)} رابطاً مختصراً، أو{' '}
              {formatCount(actionsFor(catalog, pro, 'downloader.job.create'))} تنزيلاً.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'habits', PRO))} عادة، و
              {formatCount(capOf(catalog, 'short_links', PRO))} رابطاً محفوظاً.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'community_published', PRO))} منشوراً في المجتمع، و
              {formatCount(capOf(catalog, 'quran_bookmarks', PRO))} علامة في القرآن.
            </PlanPoint>
            <PlanPoint>
              حتى {formatCount(capOf(catalog, 'mcp_connected_apps', PRO))} تطبيقات MCP متَّصلة.
            </PlanPoint>
            <PlanPoint>دعم مباشر عبر واتساب.</PlanPoint>
          </ul>

          <a
            href={getWhatsAppUrl(subscribeMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-safe hover:bg-primary/95"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            اشترك عبر واتساب
          </a>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            يُفعَّل الاشتراك يدوياً بعد تأكيد الدَّفعة، ويبدأ رصيدك من الصفر.
          </p>
        </div>
      </section>

      <section aria-label="ما يستهلك الرصيد" className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-black text-foreground">ما يستهلك الرصيد؟</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          الرصيد واحد لكل المنتجات، والتكلفة نفسها على الخطَّتين. الرقم يُخصَّص عند الطلب ويُعاد إن
          فشل، فلا تدفع مقابل محاولة لم تكتمل.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
          <table className="w-full min-w-[320px] text-sm">
            <caption className="sr-only">تكلفة كل إجراء بالرصيد</caption>
            <thead className="border-b border-border/60 text-start text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-bold">
                  الإجراء
                </th>
                <th scope="col" className="px-4 py-3 text-start font-bold">
                  التكلفة
                </th>
              </tr>
            </thead>
            <tbody>
              {costs.map((entry) => (
                <tr key={entry.actionKey} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{entry.label}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {formatCount(entry.cost)} رصيد
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="ما يمكنك حفظه" className="space-y-3">
        <h2 className="text-base font-black text-foreground">ما يمكنك حفظه؟</h2>
        <p className="text-sm text-muted-foreground">
          هذه حدود على عدد العناصر التي تحتفظ بها، لا على الرصيد. البيانات المحفوظة لا تُحذف عند
          انتهاء الخطة أو انخفاض الحد؛ يمنع الحدُّ الإضافة فقط.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
          <table className="w-full min-w-[320px] text-sm">
            <caption className="sr-only">حدود حفظ العناصر على كل خطة</caption>
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-bold">
                  العنصر
                </th>
                <th scope="col" className="px-4 py-3 text-start font-bold">
                  المجاني
                </th>
                <th scope="col" className="px-4 py-3 text-start font-bold">
                  المدفوع
                </th>
              </tr>
            </thead>
            <tbody>
              {limits.map((limit) => (
                <tr key={limit.key} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{limit.label}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {formatCount(limit.freeCap)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatCount(limit.proCap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-label="ما لا يستهلك الرصيد"
        className="rounded-2xl border border-border/60 bg-card/60 p-5"
      >
        <h2 className="flex items-center gap-2 text-base font-black text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          ما لا يستهلك الرصيد؟
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          القراءة دائماً مجانية: المجتمع، وأسعار الصرف، والقرآن الكريم، وماسح الرموز، والتحقُّق من
          الشَّهادات، ومشاهدة صفحاتك. لا نعدُّ صفحة تقرؤها.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          الزَّائر بلا حساب يحصل على{' '}
          <strong className="font-bold text-foreground">
            {formatCount(settings.anonymousDailyCredits)}
          </strong>{' '}
          أرصدة كل 24 ساعة، وعند نفادها ندعوه لتسجيل الدُّخول بدل إغلاق الباب.
        </p>
      </section>

      <section aria-label="أسئلة شائعة" className="space-y-2">
        <h2 className="text-base font-black text-foreground">أسئلة شائعة</h2>
        <Faq question="كيف أدفع؟">
          داخل سوريا عبر ShamCash، وخارجها عبر Efendim Pay. أرسل لنا على واتساب ونكمل التَّفعيل بعد
          وصول الدَّفعة.
        </Faq>
        <Faq question="متى يبدأ الاشتراك؟">
          بعد تأكيد الدَّفعة مباشرة. يحصل حسابك على رصيد كامل جديد لمدة {settings.durationDays}{' '}
          يوماً، ثم يتجدَّد تدريجيًّا حتى نهاية الفترة.
        </Faq>
        <Faq question="ماذا يحدث عند انتهاء المدة؟">
          تعود تلقائياً إلى الخطة المجانيَّة برصيد جديد. لا يوجد تجديد تلقائي، ولا تُحذف بياناتك.
        </Faq>
        <Faq question="هل أفقد بياناتي إذا لم أجدِّد؟">
          لا. تنخفض حدود الحفظ فقط، وتبقى كل العناصر التي أنشأتها؛ يمكنك التَّعديل والحذف، لكن لا
          يمكنك إضافة ما يتجاوز الحد حتَّى ترقّي الخطة أو تحذف.
        </Faq>
        <Faq question="هل يمكنني استخدام الموقع دون حساب؟">
          نعم للقراءة، ومع رصيد زائر محدود للإجراءات. الحساب المجاني يمنحك رصيداً شهريًّا أكبر ويحفظ
          عملك على كل أجهزتك.
        </Faq>
      </section>

      <section className="flex flex-col items-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-6 text-center">
        <p className="text-base font-black text-foreground">جاهز للبدء؟</p>
        <p className="max-w-md text-sm text-muted-foreground">
          ابدأ بالخطة المجانيَّة الآن، أو راسلنا لتفعيل الخطَّة المدفوعة.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-safe hover:bg-primary/95"
          >
            إنشاء حساب مجاني
          </Link>
          <a
            href={getWhatsAppUrl(subscribeMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-input/80 bg-background/80 px-5 text-sm font-bold text-foreground transition-safe hover:bg-accent/80"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            تواصل عبر واتساب
          </a>
        </div>
      </section>
    </div>
  );
}

function PlanPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-bold text-foreground marker:hidden">
        {question}
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </details>
  );
}

import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { HireApplyFlow } from '@/frontend/ui/retainers/hire-apply-flow';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { RETAINER_DEFAULT_MONTHLY_FEE_USD } from '@/shared/contracts/retainers';

export default async function HirePage() {
  const { user } = await getOptionalUser();

  return (
    <HireApplyFlow
      isAuthenticated={Boolean(user)}
      summary={
        /* Retainer summary — the page's own pitch, server-rendered so it stays
           out of the client bundle. */
        <section
          aria-label="تفاصيل التَّعاقُد الشَّهري"
          className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
        >
          <SectionTitle size="card">
            <SectionTitleHighlight>طلب التَّعاقُد الشَّهري</SectionTitleHighlight>
          </SectionTitle>
          <CollapsibleText
            lines={3}
            className="mt-2 text-sm text-muted-foreground leading-relaxed"
            buttonClassName="text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
          >
            إن كنتَ صاحب شركة أو مشروع أو صاحب فكرة ولديك حلول رقميَّة تنوي إطلاقها، فبين يديك فريق
            يتمتَّع بخبرة تتجاوز 7 سنوات يتولَّى صيانة مشاريعك وتطويرها وإدارتها، باستثمار شهري ثابت
            ودون الحاجة إلى بناء فريق داخلي.
          </CollapsibleText>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-border/50 pt-5">
            <span className="text-xs font-medium text-muted-foreground">رسوم الاستثمار</span>
            <span className="text-2xl font-black tracking-tight text-foreground">
              {`$${RETAINER_DEFAULT_MONTHLY_FEE_USD}`}
            </span>
            <span className="text-xs text-muted-foreground">شهريًّا</span>
          </div>
        </section>
      }
    />
  );
}

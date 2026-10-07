import { ArrowLeft, CalendarDays, User, Wallet } from 'lucide-react';
import { Button } from './primitives/button';
import { ScrollAnimation } from './ScrollAnimations';
import { SectionTitle, SectionTitleHighlight } from './shared/section-title';
import { CONSULTATION_START_PRICE_USD } from '@/shared/contracts/consultation';

const SESSION_SPECS = [
  { icon: User, label: 'النِّمط', value: 'جلسة فرديَّة خاصَّة' },
  { icon: CalendarDays, label: 'العدد', value: 'جلسة واحدة أو باقة جلسات' },
] as const;

export function ConsultationCards() {
  return (
    <section
      id="consultation"
      dir="rtl"
      className="relative overflow-hidden bg-slate-950 py-20 text-slate-100 selection:bg-purple-500/45 selection:text-purple-200 sm:py-28 md:py-36"
      aria-label="الاستشارات التقنيَّة"
    >
      {/* Ambient frame + dot grid, matching the Services section vocabulary */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-purple-500/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1f29371a_1px,transparent_1px),linear-gradient(to_bottom,#1f29371a_1px,transparent_1px)] bg-size-[3.5rem_3.5rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_30%,#000_70%,transparent_100%)]" />
      <div className="pointer-events-none absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-purple-600/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation animation="slide-up" duration={0.7}>
          {/* Header */}
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
            <SectionTitle tone="inverse">
              <SectionTitleHighlight>الاستشارات</SectionTitleHighlight>
            </SectionTitle>
          </div>

          {/* Session details */}
          <div className="mx-auto max-w-2xl">
            <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-linear-to-b from-purple-950/50 via-slate-950/80 to-slate-950/95 p-6 sm:p-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-transparent via-purple-500 to-transparent opacity-80" />
              <p className="text-sm leading-relaxed text-slate-300">
                سؤال مُحدَّد في المواقع والتَّطبيقات، أو باقة جلسات على مدى فترة — تُقدَّم أونلاين
                عبر جلسة صوتيَّة مباشرة.
              </p>

              <dl className="mt-5 space-y-4">
                {SESSION_SPECS.map((spec) => (
                  <div key={spec.label} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
                      <spec.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <dt className="text-xs font-medium text-purple-200/70">{spec.label}</dt>
                      <dd className="text-sm font-bold text-white">{spec.value}</dd>
                    </div>
                  </div>
                ))}

                <div className="flex items-start gap-3 border-t border-purple-500/15 pt-4">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-xs font-medium text-purple-200/70">تبدأ من</dt>
                    <dd className="flex items-baseline gap-2">
                      <span
                        dir="ltr"
                        className="bg-linear-to-r from-purple-200 via-white to-purple-300 bg-clip-text text-2xl font-black tracking-tight text-transparent"
                      >
                        {`$${CONSULTATION_START_PRICE_USD}`}
                      </span>
                      <span className="text-xs text-slate-400">حسب الباقة</span>
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="mt-6 border-t border-purple-500/15 pt-6">
                <Button
                  asChild
                  variant="hero"
                  size="lg"
                  className="group/btn w-full gap-3 text-lg sm:text-xl"
                >
                  <a href="/consultation/book" aria-label="احجز استشارتك الآن">
                    <span>احجز استشارتك الآن</span>
                    <ArrowLeft className="size-5 transition-transform duration-300 group-hover/btn:-translate-x-1" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

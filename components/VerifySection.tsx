'use client';

import { ShieldCheck, ArrowLeft, Copy } from '@phosphor-icons/react';
import { ScanLine, Lock, Database, QrCode, CheckCircle, FileText } from 'lucide-react';
import { ScrollAnimation } from './ScrollAnimations';
import Link from 'next/link';

export function VerifySection() {
  return (
    <section id="verify" className="section-spacing relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-purple-950 to-slate-900">
        <div className="absolute top-0 right-1/4 w-150 h-150 bg-[#7766EE] opacity-5 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-1/4 w-150 h-150 bg-[#A78BFA] opacity-5 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-100 h-100 bg-[#6366F1] opacity-3 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto container-padding">
        <ScrollAnimation animation="slide-up" duration={0.8}>
          <div className="text-center mb-10 lg:mb-16">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-[#7766EE] to-[#A78BFA] flex items-center justify-center shadow-lg shadow-primary/25 relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent motion-safe:animate-[shine-slide_3s_linear_infinite]" />
                <ShieldCheck className="w-8 h-8 text-white relative z-10" weight="fill" />
              </div>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold">
              التَّحقُّق من <span className="gradient-text">الشَّهادة</span>
            </h2>

            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl mx-auto leading-[1.8] sm:leading-[1.9]">
              نظام توثيق رقمي يضمن لك مصداقيَّة الشَّهادات الصَّادرة عن رؤية رقمية.
            </p>
          </div>
        </ScrollAnimation>

        {/* Browser Device Mockup */}
        <ScrollAnimation animation="scale" duration={0.8} delay={0.15}>
          <div className="max-w-2xl mx-auto mb-10 lg:mb-14 select-none" aria-hidden="true">
            {/* Browser Chrome */}
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-t-2xl border border-white/8 border-b-0 px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/20">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 max-w-md mx-auto">
                <div className="h-7 rounded-lg bg-white/6 border border-white/6 flex items-center justify-center gap-2 px-3">
                  <Lock className="w-3 h-3 text-emerald-400/70" />
                  <span className="text-[11px] text-muted-foreground/50 truncate tracking-wide">
                    royaraqamia.com/verify
                  </span>
                </div>
              </div>
            </div>

            <div
              className="bg-slate-900/40 backdrop-blur-sm rounded-b-2xl border border-white/8 p-6 md:p-8 shadow-lg shadow-black/20"
              role="presentation"
            >
              <div className="flex flex-col items-center text-center gap-5">
                <div className="w-14 h-14 rounded-xl bg-white/4 border border-dashed border-white/8 flex items-center justify-center">
                  <QrCode className="w-6 h-6 text-muted-foreground/40" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm text-foreground/50 font-medium">رمز الشهادة</p>
                  <div className="flex items-center gap-2 justify-center">
                    <div className="h-10 px-4 flex items-center border border-dashed border-white/8 rounded-lg bg-white/3">
                      <span className="text-sm text-muted-foreground/40 font-mono tracking-[0.15em]">
                        COMP-2026-A1B2C3D4
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-white/4 border border-dashed border-white/8 flex items-center justify-center">
                      <Copy className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  </div>
                </div>

                <div className="h-10 px-6 rounded-lg bg-white/5 border border-dashed border-white/8 flex items-center justify-center gap-2">
                  <ScanLine className="w-4 h-4 text-muted-foreground/30" />
                  <span className="text-sm text-muted-foreground/30 font-medium">تحقُّق</span>
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="mt-3 flex items-center justify-center gap-3">
              <div className="h-px flex-1 max-w-16 bg-linear-to-l from-white/6 to-transparent" />
              <span className="text-[11px] text-muted-foreground/50 tracking-wide">
                واجهة التّحقق التوضيحيّة
              </span>
              <div className="h-px flex-1 max-w-16 bg-linear-to-r from-white/6 to-transparent" />
            </div>
          </div>
        </ScrollAnimation>

        {/* How It Works Strip */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.25}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0 mb-10 lg:mb-14 max-w-lg mx-auto">
            {[
              { icon: FileText, label: 'أدخل رمز الشهادة', sub: 'مكوّن من 16 حرفًا' },
              { icon: ScanLine, label: 'تحقّق فوري', sub: 'من قاعدة البيانات' },
              { icon: CheckCircle, label: 'احصل على النتيجة', sub: 'موثّقة وموقّعة' },
            ].map((step, i) => (
              <div key={i} className="flex items-center w-full sm:w-auto">
                {i > 0 && (
                  <div className="hidden sm:block w-8 h-px bg-linear-to-l from-white/8 to-transparent mx-2 shrink-0" />
                )}
                <div className="flex items-center gap-3 flex-1 sm:flex-initial">
                  <div className="w-9 h-9 rounded-full bg-white/4 border border-white/8 flex items-center justify-center shrink-0">
                    <step.icon className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground/60">{step.label}</p>
                    <p className="text-xs text-muted-foreground/40">{step.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollAnimation>

        {/* CTA Button */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.3}>
          <div className="text-center">
            <Link
              href="/verify"
              className="primary-cta-btn cta-glow relative overflow-hidden h-14 sm:h-16 inline-flex items-center justify-center px-8 sm:px-12 rounded-full bg-linear-to-r from-[#7766EE] to-[#A78BFA] text-white text-base sm:text-xl font-bold motion-safe:transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white group"
            >
              <span className="relative flex items-center gap-3 z-10">
                الانتقال إلى التَّحقُّق
                <ArrowLeft className="w-6 h-6 motion-safe:transition-transform duration-300 group-hover:-translate-x-1" />
              </span>
              <span className="shine-effect absolute inset-0 -translate-x-full motion-safe:transition-transform duration-700 bg-linear-to-r from-transparent via-white/25 to-transparent motion-safe:group-hover:translate-x-full" />
            </Link>
          </div>
        </ScrollAnimation>

        {/* Trust Footer */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.4}>
          <div className="mt-12 border-t border-white/5 pt-8">
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                اتصال مشفر SSL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" weight="bold" />
                نظام توثيق رقمي
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                التحقق آني من قاعدة البيانات
              </span>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

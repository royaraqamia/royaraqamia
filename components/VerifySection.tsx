'use client';

import { ShieldCheck, ArrowLeft } from '@phosphor-icons/react';
import { ScanLine, Lock, Database } from 'lucide-react';
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
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-[#7766EE] to-[#A78BFA] flex items-center justify-center shadow-lg shadow-primary/25 relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent animate-[shine-slide_3s_linear_infinite]" />
                <ShieldCheck className="w-8 h-8 text-white relative z-10" weight="fill" />
              </div>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold">
              التَّحقُّق من <span className="gradient-text">الشَّهادات</span>
            </h2>

            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl mx-auto leading-[1.8] sm:leading-[1.9]">
              أدخل رمز الشَّهادة للتَّحقُّق من صحَّتها وأصالتها. نظام توثيق رقمي يضمن لك مصداقية
              الشَّهادات الصَّادرة عن رؤية رقمية.
            </p>
          </div>
        </ScrollAnimation>

        {/* Verification Mockup Card */}
        <ScrollAnimation animation="scale" duration={0.8} delay={0.15}>
          <div className="glass-card rounded-3xl overflow-hidden border border-white/5 max-w-2xl mx-auto mb-10">
            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row items-stretch sm:items-center">
                <div className="relative flex-1">
                  <div className="absolute inset-s-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ScanLine className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="h-12 min-h-11 ps-10 pe-4 flex items-center border border-white/10 rounded-xl bg-white/5 text-muted-foreground text-base tracking-wider select-none">
                    COMP-2026-A1B2C3D4
                  </div>
                </div>
                <div className="h-12 min-h-11 flex items-center justify-center gap-2 px-6 rounded-xl bg-linear-to-r from-[#7766EE] to-[#A78BFA] text-white font-semibold text-base cursor-default shrink-0">
                  <ScanLine className="w-5 h-5" />
                  تحقُّق
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <ScanLine className="w-3.5 h-3.5" />
                <span>مثال: COMP-2026-A1B2C3D4</span>
              </div>
            </div>
          </div>
        </ScrollAnimation>

        {/* CTA Button */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.3}>
          <div className="text-center">
            <Link
              href="/verify"
              className="primary-cta-btn cta-glow relative overflow-hidden h-14 sm:h-16 inline-flex items-center justify-center px-8 sm:px-12 rounded-full bg-linear-to-r from-[#7766EE] to-[#A78BFA] text-white text-base sm:text-xl font-bold transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white group"
            >
              <span className="relative flex items-center gap-3 z-10">
                الانتقال إلى التَّحقُّق
                <ArrowLeft className="w-6 h-6 transition-transform duration-300 group-hover:-translate-x-1" />
              </span>
              <span className="shine-effect absolute inset-0 -translate-x-full transition-transform duration-700 bg-linear-to-r from-transparent via-white/25 to-transparent group-hover:translate-x-full" />
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

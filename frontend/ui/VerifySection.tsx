import { ShieldCheck, ArrowLeft, Copy } from 'lucide-react';
import { ScanLine, Lock, Database, QrCode, CheckCircle, FileText } from 'lucide-react';
import { ScrollAnimation } from './ScrollAnimations';
import Link from 'next/link';

export function VerifySection() {
  return (
    <section
      id="verify"
      dir="rtl"
      aria-labelledby="verify-heading"
      className="relative overflow-hidden bg-slate-950 py-20 sm:py-28 lg:py-36 text-slate-100 isolate select-none sm:select-text"
    >
      {/* Dynamic Background Atmosphere */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Modern Vector Mesh Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] bg-size-[24px_24px] opacity-20 mask-[radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />

        {/* High-End Ambient Glowing Orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150 h-150 bg-linear-to-b from-[#7766EE]/20 via-[#6366F1]/10 to-transparent blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 right-1/4 w-112.5 h-112.5 bg-linear-to-t from-[#A78BFA]/15 via-purple-900/10 to-transparent blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 -left-20 -translate-y-1/2 w-87.5 h-87.5 bg-[#6366F1]/10 blur-[120px] rounded-full pointer-events-none" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <ScrollAnimation animation="slide-up" duration={0.8}>
          <div className="text-center mb-12 sm:mb-16 lg:mb-20">
            {/* Glowing Icon Shield Badge */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative group">
                <div className="absolute -inset-1.5 bg-linear-to-r from-[#7766EE] via-[#222346] to-[#A78BFA] rounded-3xl blur-lg opacity-40 group-hover:opacity-75 transition duration-500" />
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-linear-to-br from-[#7766EE] via-[#6366F1] to-[#A78BFA] flex items-center justify-center shadow-2xl border border-white/20 overflow-hidden">
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                  <ShieldCheck
                    className="w-9 h-9 sm:w-11 sm:h-11 text-white relative z-10 drop-shadow-md"
                    fill="currentColor"
                  />
                </div>
              </div>
            </div>

            {/* Section Main Title */}
            <h2
              id="verify-heading"
              className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 mb-4 sm:mb-6 leading-tight sm:leading-tight"
            >
              التَّحقُّق من{' '}
              <span className="bg-linear-to-r from-[#7766EE] via-purple-300 to-[#A78BFA] bg-clip-text text-transparent">
                الشَّهادة
              </span>
            </h2>

            {/* Description */}
            <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed text-balance">
              نظام توثيق رقمي يضمن لك مصداقيَّة الشَّهادات الصَّادرة عن رؤية رقمية.
            </p>
          </div>
        </ScrollAnimation>

        {/* Browser Device Mockup Showcase */}
        <ScrollAnimation animation="scale" duration={0.8} delay={0.15}>
          <div className="max-w-2xl mx-auto mb-12 sm:mb-16 lg:mb-20">
            <div className="p-px rounded-2xl sm:rounded-3xl bg-linear-to-b from-white/20 via-white/10 to-transparent shadow-2xl shadow-black/80 backdrop-blur-xl">
              <div className="rounded-2xl sm:rounded-3xl bg-slate-900/90 overflow-hidden border border-white/10">
                {/* Browser Window Header Controls */}
                <div className="bg-slate-950/80 px-4 sm:px-6 py-3.5 border-b border-white/10 flex items-center justify-between gap-4 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-400/30" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400/30" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400/30" />
                  </div>

                  <div className="flex-1 max-w-xs sm:max-w-md mx-auto">
                    <div className="h-8 rounded-xl bg-slate-900/90 border border-white/10 px-3 flex items-center justify-center gap-2 text-xs font-mono text-slate-400 shadow-inner group/url hover:border-indigo-500/30 transition-colors">
                      <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate tracking-wide text-slate-300">
                        royaraqamia.com/verify
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>آمن 256-bit</span>
                  </div>
                </div>

                {/* Mockup Display Content */}
                <div className="bg-linear-to-b from-slate-900/90 via-slate-950/90 to-slate-900/90 p-6 sm:p-10 text-center relative">
                  <div className="flex flex-col items-center gap-6">
                    {/* Futuristic QR Display */}
                    <div className="relative group/qr">
                      <div className="absolute -inset-1.5 bg-linear-to-r from-[#7766EE] to-[#A78BFA] rounded-2xl blur opacity-25 group-hover/qr:opacity-50 transition duration-300" />
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950/90 border border-indigo-500/30 flex items-center justify-center shadow-lg group-hover/qr:scale-105 transition-transform duration-300">
                        <QrCode className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400 group-hover/qr:text-indigo-300 transition-colors" />
                      </div>
                    </div>

                    {/* Certificate Code Input Mock */}
                    <div className="w-full max-w-md space-y-2">
                      <p className="text-xs sm:text-sm text-slate-400 font-medium">رمز الشَّهادة</p>
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-2.5">
                        <div className="h-11 px-4 sm:px-6 rounded-xl bg-slate-950/90 border border-indigo-500/30 text-indigo-200 font-mono text-xs sm:text-sm tracking-widest flex items-center justify-center shadow-inner flex-1 min-w-50">
                          <span className="select-all">COMP-2026-A1B2C3D4</span>
                        </div>
                        <button
                          type="button"
                          aria-label="نسخ رمز الشَّهادة"
                          className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/40 active:scale-95 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 group/copy"
                        >
                          <Copy className="w-4 h-4 group-hover/copy:scale-110 transition-transform" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Verification Status Pill */}
                    <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs sm:text-sm font-medium">
                      <ScanLine className="w-4 h-4 text-indigo-400 animate-pulse" />
                      <span>تحقُّق فوري متاح</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Device Caption */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="h-px flex-1 max-w-20 bg-linear-to-l from-white/10 to-transparent" />
              <span className="text-xs text-slate-500 font-medium tracking-wide">
                واجهة التَّحقُّق التَّوضيحيَّة
              </span>
              <div className="h-px flex-1 max-w-20 bg-linear-to-r from-white/10 to-transparent" />
            </div>
          </div>
        </ScrollAnimation>

        {/* How It Works Grid Steps */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.25}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16 lg:mb-20 max-w-4xl mx-auto">
            {[
              {
                icon: FileText,
                step: '01',
                label: 'أدخِل رمز الشَّهادة',
                sub: 'مُكوَّن من 16 حرفًا',
              },
              {
                icon: ScanLine,
                step: '02',
                label: 'تحقُّق فوري',
                sub: 'من قاعدة البيانات',
              },
              {
                icon: CheckCircle,
                step: '03',
                label: 'احصل على النَّتيجة',
                sub: 'مُوثَّقة ومُوقَّعة',
              },
            ].map((step, i) => (
              <div
                key={i}
                className="relative group/step p-6 rounded-2xl bg-linear-to-b from-white/5 to-white/1 border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.07] transition-all duration-300 shadow-xl shadow-black/20 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover/step:scale-110 group-hover/step:bg-indigo-500/20 group-hover/step:text-indigo-300 transition-all duration-300">
                    <step.icon className="w-6 h-6" />
                  </div>
                  <span className="text-2xl font-black font-mono text-slate-700 group-hover/step:text-indigo-400/50 transition-colors">
                    {step.step}
                  </span>
                </div>
                <div className="space-y-1 text-right">
                  <h3 className="text-base sm:text-lg font-bold text-slate-100 group-hover/step:text-indigo-300 transition-colors">
                    {step.label}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{step.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollAnimation>

        {/* Primary Call-to-Action */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.3}>
          <div className="text-center">
            <Link
              href="/verify"
              className="relative inline-flex items-center justify-center group overflow-hidden rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-2xl shadow-indigo-600/30 hover:shadow-indigo-500/50"
            >
              <span className="absolute inset-0 bg-linear-to-r from-[#7766EE] via-[#6366F1] to-[#A78BFA] rounded-full" />
              <span className="relative inline-flex items-center gap-3.5 px-8 sm:px-12 py-4 sm:py-5 rounded-full bg-slate-950 text-white font-bold text-base sm:text-xl transition-all duration-300 group-hover:bg-slate-950/80">
                <span>الانتقال إلى التَّحقُّق</span>
                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:-translate-x-1.5" />
              </span>
            </Link>
          </div>
        </ScrollAnimation>

        {/* Trust & Security Badge Footer */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.4}>
          <div className="mt-14 sm:mt-20 border-t border-white/10 pt-8 sm:pt-10">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-slate-400 font-medium">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/3 border border-white/10 hover:border-white/20 transition-colors">
                <Lock className="w-4 h-4 text-indigo-400" />
                <span>اتِّصال مُشفَّر SSL</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/3 border border-white/10 hover:border-white/20 transition-colors">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>نظام توثيق رقمي</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/3 border border-white/10 hover:border-white/20 transition-colors">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>التَّحقُّق آني من قاعدة البيانات</span>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

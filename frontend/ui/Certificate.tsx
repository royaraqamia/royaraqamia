'use client';

import { ShieldCheck, BadgeCheck, Share2 } from 'lucide-react';
import { LazyImage } from './LazyImage';
import { MotionReveal } from './MotionReveal';

export function Certificate() {
  return (
    <section
      id="certificate"
      aria-labelledby="certificate-heading"
      className="py-20 sm:py-28 lg:py-36 bg-[#040711] relative overflow-hidden select-none"
    >
      {/* Background Atmosphere & Grid Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Modern Radial Masked Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] bg-size-[24px_24px] opacity-70 mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <MotionReveal from="translateY(-20px)" duration={0.8}>
          <header className="text-center mb-12 sm:mb-16 flex flex-col items-center">
            {/* Headline */}
            <h2
              id="certificate-heading"
              className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]"
            >
              نموذج عن{' '}
              <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-300 via-violet-300 to-indigo-400 drop-shadow-sm">
                الشَّهادة
              </span>
            </h2>
          </header>
        </MotionReveal>

        {/* 3D Certificate Visual Stage */}
        <MotionReveal from="translateY(50px) scale(0.96)" duration={0.8}>
          <div className="flex flex-col items-center justify-center gap-6">
            {/* Outer Glass Frame */}
            <div className="w-full max-w-4xl p-2 sm:p-3 md:p-4 rounded-3xl md:rounded-[2.5rem] bg-slate-900/55 border border-white/10 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] hover:shadow-[0_30px_100px_-10px_rgba(147,51,234,0.25)] transition-shadow duration-700">
              {/* Certificate card */}
              <div className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/15 bg-slate-950/88">
                {/* Ring Border */}
                <div className="absolute inset-0 z-10 pointer-events-none border-2 rounded-2xl md:rounded-3xl border-purple-500/0" />

                {/* Certificate Image Component */}
                <LazyImage
                  src="/certificate.webp"
                  alt="نموذج شهادة إتمام الدَّورة التَّدريبيَّة مُعتمَدَة من رؤيَة رقَميَّة"
                  width={1200}
                  height={848}
                  className="w-full h-auto relative z-0 object-cover transform transition-transform duration-700"
                />
              </div>
            </div>

            {/* Certificate Credential Features Bar */}
            <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-4">
              <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/9 transition-colors duration-300">
                <div className="p-2.5 rounded-xl bg-purple-500/14 border border-purple-500/20 text-purple-400 shrink-0">
                  <BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-white">اعتماد رسمي من قِبَلنا</p>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                    مُزوَّدَة برقم مُعرِّف تسلسلي خاص
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/9 transition-colors duration-300">
                <div className="p-2.5 rounded-xl bg-indigo-500/14 border border-indigo-500/20 text-indigo-400 shrink-0">
                  <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-white">رمز تحقُّق إلكتروني</p>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                    للتَّحقُّق السَّريع من جدارة صاحبها
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/9 transition-colors duration-300">
                <div className="p-2.5 rounded-xl bg-violet-500/14 border border-violet-500/20 text-violet-400 shrink-0">
                  <Share2 className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-white">جاهزة للمشاركة</p>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                    بصيغة عالية الدِّقَّة لمنصَّة LinkedIn
                  </p>
                </div>
              </div>
            </div>
          </div>
        </MotionReveal>
      </div>
    </section>
  );
}

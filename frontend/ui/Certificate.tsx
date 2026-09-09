'use client';

import { useRef, useState, useCallback, MouseEvent, TouchEvent } from 'react';
import { m, useInView } from 'motion/react';
import { ShieldCheck, BadgeCheck, Share2 } from 'lucide-react';
import { LazyImage } from './LazyImage';

// --- Framer Motion Variants (entrance only) ---
const headerVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.12 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 80, damping: 20 },
  },
} as const;

export function Certificate() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const certificateRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isHeaderInView = useInView(headerRef, { once: true, margin: '-50px' });
  const isCertificateInView = useInView(certificateRef, { once: true, margin: '-80px' });

  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // RAF-throttled pointer tracking — updates CSS custom properties on the
  // compositor thread. CSS transitions handle smoothing instead of JS springs.
  const rafId = useRef(0);
  const updatePointerPosition = useCallback(
    (clientX: number, clientY: number, currentTarget: HTMLElement) => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - left) / width));
        const y = Math.max(0, Math.min(1, (clientY - top) / height));
        const el = cardRef.current;
        if (el) {
          el.style.setProperty('--mx', String(x));
          el.style.setProperty('--my', String(y));
        }
      });
      if (!hasInteracted) setHasInteracted(true);
    },
    [hasInteracted]
  );

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    updatePointerPosition(e.clientX, e.clientY, e.currentTarget);
  };

  const handleMouseLeave = useCallback(() => {
    setIsPressed(false);
    const el = cardRef.current;
    if (el) {
      el.style.setProperty('--mx', '0.5');
      el.style.setProperty('--my', '0.5');
    }
  }, []);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    setIsPressed(true);
    const touch = e.touches[0];
    if (touch) {
      updatePointerPosition(touch.clientX, touch.clientY, e.currentTarget);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) {
      updatePointerPosition(touch.clientX, touch.clientY, e.currentTarget);
    }
  };

  const handleTouchEnd = useCallback(() => {
    setIsPressed(false);
    const el = cardRef.current;
    if (el) {
      el.style.setProperty('--mx', '0.5');
      el.style.setProperty('--my', '0.5');
    }
  }, []);
  return (
    <section
      ref={sectionRef}
      id="certificate"
      aria-labelledby="certificate-heading"
      className="py-20 sm:py-28 lg:py-36 bg-[#040711] relative overflow-hidden select-none"
    >
      {/* Background Atmosphere & Grid Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Modern Radial Masked Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] bg-size-[24px_24px] opacity-70 mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Top Ambient Light Beam — horizontal mask replaces a live blur
            filter: same soft edges, rasterized once */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-72 bg-linear-to-b from-purple-500/15 via-violet-500/5 to-transparent mask-[linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] pointer-events-none" />

        {/* Parallax Purple Dynamic Light Sphere */}
        <div className="absolute top-1/4 -right-24 w-96 sm:w-125 h-96 sm:h-125 text-purple-600/25 rounded-full glow-orb pointer-events-none" />

        {/* Indigo Ambient Glow (static — animated blur of this size re-rasterizes every frame) */}
        <div className="absolute bottom-10 -left-24 w-96 sm:w-130 h-96 sm:h-130 text-indigo-600/15 rounded-full glow-orb pointer-events-none" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <m.header
          ref={headerRef}
          initial="hidden"
          animate={isHeaderInView ? 'visible' : 'hidden'}
          variants={headerVariants}
          className="text-center mb-12 sm:mb-16 flex flex-col items-center"
        >
          {/* Headline */}
          <m.h2
            id="certificate-heading"
            variants={itemVariants}
            className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]"
          >
            نموذج عن{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-300 via-violet-300 to-indigo-400 drop-shadow-sm">
              الشَّهادة
            </span>
          </m.h2>
        </m.header>

        {/* 3D Certificate Visual Stage */}
        <m.div
          ref={certificateRef}
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={
            isCertificateInView
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 50, scale: 0.96 }
          }
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center perspective-[2000px] gap-6"
        >
          {/* Outer Glass Frame */}
          <div className="w-full max-w-4xl p-2 sm:p-3 md:p-4 rounded-3xl md:rounded-[2.5rem] bg-slate-900/55 border border-white/10 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] hover:shadow-[0_30px_100px_-10px_rgba(147,51,234,0.25)] transition-shadow duration-700">
            {/* Interactive 3D Card — CSS custom properties drive rotation and
                glare. Smoothing is handled by CSS transitions (compositor thread)
                instead of JS spring physics (main thread). */}
            <div
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={
                {
                  // Default to center (0.5, 0.5) — CSS calc maps to 0deg rotation
                  '--mx': 0.5,
                  '--my': 0.5,
                  transformStyle: 'preserve-3d',
                  transform:
                    'rotateX(calc((0.5 - var(--my)) * 20deg)) rotateY(calc((var(--mx) - 0.5) * 20deg)) scale(var(--card-scale, 1))',
                  transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                } as React.CSSProperties
              }
              className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/15 bg-slate-950/88 cursor-grab active:cursor-grabbing group touch-pan-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040711]"
              data-pressed={isPressed || undefined}
              tabIndex={0}
              role="region"
              aria-label="معاينة ثلاثيَّة الأبعاد لشهادة الإتمام"
            >
              {/* Dynamic Glare Overlay — gradient position driven by CSS custom
                  properties, recomposited on compositor thread only. */}
              <div
                className={`absolute inset-0 z-20 pointer-events-none mix-blend-overlay transition-opacity duration-300 ${
                  isPressed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{
                  background:
                    'radial-gradient(circle at calc(var(--mx) * 100%) calc(var(--my) * 100%), rgba(255,255,255,0.45) 0%, transparent 60%)',
                }}
              />

              {/* Glowing Active Ring Border */}
              <div
                className={`absolute inset-0 z-10 pointer-events-none border-2 rounded-2xl md:rounded-3xl transition-[border-color,box-shadow] duration-500 ${
                  isPressed
                    ? 'border-purple-400/60 shadow-[inset_0_0_60px_rgba(168,85,247,0.25)]'
                    : 'border-purple-500/0 group-hover:border-purple-400/40 group-hover:shadow-[inset_0_0_60px_rgba(168,85,247,0.15)]'
                }`}
              />

              {/* Certificate Image Component */}
              <LazyImage
                src="/certificate.webp"
                alt="نموذج شهادة إتمام الدَّورة التَّدريبيَّة مُعتمَدَة من رؤية رقمية"
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
        </m.div>
      </div>
    </section>
  );
}

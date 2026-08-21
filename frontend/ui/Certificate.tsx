'use client';

import { useRef, useState, MouseEvent, TouchEvent } from 'react';
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from 'motion/react';
import { Trophy, ShieldCheck, BadgeCheck, Share2, MoveLeft } from 'lucide-react';
import { LazyImage } from './LazyImage';

// --- Framer Motion Variants ---
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

  const isHeaderInView = useInView(headerRef, { once: true, margin: '-50px' });
  const isCertificateInView = useInView(certificateRef, { once: true, margin: '-80px' });

  // State to track if the user has interacted (to hide the interactive hint)
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // 3D Physics Tracking Values
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // High-precision smooth spring mechanics
  const smoothX = useSpring(mouseX, { stiffness: 180, damping: 22 });
  const smoothY = useSpring(mouseY, { stiffness: 180, damping: 22 });

  // 3D Rotation Mapping (-10deg to 10deg)
  const rotateX = useTransform(smoothY, [0, 1], [10, -10]);
  const rotateY = useTransform(smoothX, [0, 1], [-10, 10]);

  // Dynamic Glare Position Mapping
  const glareX = useTransform(smoothX, [0, 1], [-100, 200]);
  const glareY = useTransform(smoothY, [0, 1], [-100, 200]);

  // Unified position handler for both Mouse & Touch
  const updatePointerPosition = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - left) / width));
    const y = Math.max(0, Math.min(1, (clientY - top) / height));
    mouseX.set(x);
    mouseY.set(y);
    if (!hasInteracted) setHasInteracted(true);
  };

  // --- Desktop Handlers ---
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    updatePointerPosition(e.clientX, e.clientY, e.currentTarget);
  };

  const handleMouseLeave = () => {
    setIsPressed(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  // --- Mobile Touch & Hold Handlers ---
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

  const handleTouchEnd = () => {
    setIsPressed(false);
    // Smoothly snap back to center when user releases finger
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  // Background Parallax Scroll
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, 120]);

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

        {/* Top Ambient Light Beam */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-72 bg-linear-to-b from-purple-500/15 via-violet-500/5 to-transparent blur-3xl pointer-events-none" />

        {/* Parallax Purple Dynamic Light Sphere */}
        <motion.div
          style={{ y: backgroundY }}
          className="absolute top-1/4 -right-24 w-96 sm:w-125 h-96 sm:h-125 bg-purple-600/15 rounded-full glow-blur-xl pointer-events-none"
        />

        {/* Indigo Ambient Pulsing Glow */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.18, 0.08] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 -left-24 w-96 sm:w-130 h-96 sm:h-130 bg-indigo-600/15 rounded-full glow-blur-xl pointer-events-none"
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.header
          ref={headerRef}
          initial="hidden"
          animate={isHeaderInView ? 'visible' : 'hidden'}
          variants={headerVariants}
          className="text-center mb-12 sm:mb-16 flex flex-col items-center"
        >
          {/* Trophy Badge Container */}
          <motion.div variants={itemVariants} className="mb-6 relative group cursor-pointer">
            <div className="absolute -inset-2 bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 rounded-3xl blur-xl opacity-40 group-hover:opacity-80 transition duration-500" />

            <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-linear-to-br from-purple-400 via-violet-500 to-purple-700 flex items-center justify-center shadow-2xl shadow-purple-500/30 relative overflow-hidden group-hover:scale-105 group-hover:-rotate-3 transition-transform duration-500 border border-purple-300/40">
              {/* Internal Shimmer Highlight */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out bg-linear-to-r from-transparent via-white/30 to-transparent w-full -skew-x-12 z-0 pointer-events-none" />
              <Trophy
                className="w-10 h-10 sm:w-11 sm:h-11 text-white relative z-10 drop-shadow-md"
                fill="currentColor"
              />
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h2
            id="certificate-heading"
            variants={itemVariants}
            className="text-3xl sm:text-5xl lg:text-6xl mb-5 font-black tracking-tight text-white leading-[1.15]"
          >
            نموذج عن{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-300 via-violet-300 to-indigo-400 drop-shadow-sm">
              الشَّهادة
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg text-slate-300/80 max-w-2xl mx-auto leading-relaxed font-normal"
          >
            وثيقة تُثبت جدارتك المهنيَّة، وتُعَد جواز مرورك لفرص وظيفيَّة ومشاريع حقيقيَّة في
            السُّوق الرَّقمي.
          </motion.p>
        </motion.header>

        {/* 3D Certificate Visual Stage */}
        <motion.div
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
          {/* Dynamic Motion Indicator */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium backdrop-blur-xl border transition-all duration-500 shadow-lg ${
              hasInteracted
                ? 'bg-purple-950/40 text-purple-300 border-purple-500/30'
                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-purple-400/40'
            }`}
          >
            <MoveLeft
              className={`w-4 h-4 text-purple-400 ${!hasInteracted ? 'animate-bounce' : ''}`}
              fill="currentColor"
            />
            <span>
              {hasInteracted
                ? 'المعاينة التَّفاعليَّة ثلاثيَّة الأبعاد نشطة'
                : 'حرِّك الفأرة أو اللمس لتغيير المنظور 3D'}
            </span>
          </motion.div>

          {/* Outer Glass Frame */}
          <div className="w-full max-w-4xl p-2 sm:p-3 md:p-4 rounded-3xl md:rounded-[2.5rem] bg-slate-900/40 border border-white/10 backdrop-blur-2xl shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] hover:shadow-[0_30px_100px_-10px_rgba(147,51,234,0.25)] transition-shadow duration-700">
            {/* Interactive 3D Card */}
            <motion.div
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }}
              animate={{
                scale: isPressed ? 1.02 : 1,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/15 bg-slate-950/80 cursor-grab active:cursor-grabbing group touch-pan-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040711]"
              tabIndex={0}
              role="region"
              aria-label="معاينة ثلاثيَّة الأبعاد لشهادة الإتمام"
            >
              {/* Dynamic Glare Overlay */}
              <motion.div
                className={`absolute inset-0 z-20 pointer-events-none mix-blend-overlay transition-opacity duration-300 ${
                  isPressed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{
                  background: useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.45) 0%, transparent 60%)`,
                }}
              />

              {/* Glowing Active Ring Border */}
              <div
                className={`absolute inset-0 z-10 pointer-events-none border-2 rounded-2xl md:rounded-3xl transition-all duration-500 ${
                  isPressed
                    ? 'border-purple-400/60 shadow-[inset_0_0_60px_rgba(168,85,247,0.25)]'
                    : 'border-purple-500/0 group-hover:border-purple-400/40 group-hover:shadow-[inset_0_0_60px_rgba(168,85,247,0.15)]'
                }`}
              />

              {/* Certificate Image Component */}
              <LazyImage
                src="/certificate.webp"
                alt="نموذج شهادة إتمام الدَّورة التَّدريبيَّة مُعتمَدَة من رؤية رقمية"
                width={1200}
                height={848}
                className="w-full h-auto relative z-0 object-cover transform transition-transform duration-700"
              />
            </motion.div>
          </div>

          {/* Certificate Credential Features Bar */}
          <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-4">
            <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/2 border border-white/10 backdrop-blur-md hover:bg-white/5 transition-colors duration-300">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                <BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-white">
                  اعتماد رسمي من قِبَلنا
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  مُزوَّدَة برقم مُعرِّف تسلسلي خاص
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/2 border border-white/10 backdrop-blur-md hover:bg-white/5 transition-colors duration-300">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-white">رمز تحقُّق إلكتروني</p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  للتَّحقُّق السَّريع من جدارة صاحبها
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/2 border border-white/10 backdrop-blur-md hover:bg-white/5 transition-colors duration-300">
              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0">
                <Share2 className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-white">جاهزة للمشاركة</p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  بصيغة عالية الدِّقَّة لمنصَّة LinkedIn
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

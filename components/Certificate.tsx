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
import { Trophy, SealCheck, HandPointing } from '@phosphor-icons/react';
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
      className="py-24 lg:py-36 bg-[#040711] relative overflow-hidden select-none"
    >
      {/* Background Lighting & Grid Effects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Subtle Tech Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] bg-size-[24px_24px] opacity-40" />

        {/* Parallax Amber Glow */}
        <motion.div
          style={{ y: backgroundY }}
          className="absolute top-1/4 -right-20 w-112.5 h-112.5 bg-purple-500/10 rounded-full blur-[140px] pointer-events-none"
        />

        {/* Indigo Ambient Glow */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 -left-20 w-125 h-125 bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none"
        />
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 md:px-12 relative z-10">
        {/* Section Header */}
        <motion.div
          ref={headerRef}
          initial="hidden"
          animate={isHeaderInView ? 'visible' : 'hidden'}
          variants={headerVariants}
          className="text-center mb-16 flex flex-col items-center"
        >
          {/* Trophy Badge */}
          <motion.div variants={itemVariants} className="mb-6 relative group cursor-pointer">
            <div className="absolute -inset-1 bg-linear-to-r from-purple-500 to-violet-500 rounded-3xl blur-md opacity-40 group-hover:opacity-80 transition duration-500" />

            <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-purple-400 via-violet-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-purple-500/30 relative overflow-hidden group-hover:scale-105 group-hover:-rotate-3 transition-transform duration-500 border border-purple-300/30">
              {/* Internal shimmer effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/40 to-transparent w-1/2 -skew-x-12 z-0" />
              <Trophy
                className="w-10 h-10 text-white relative z-10 drop-shadow-md"
                weight="duotone"
              />
            </div>
          </motion.div>

          <motion.h2
            id="certificate-heading"
            variants={itemVariants}
            className="text-3xl sm:text-5xl lg:text-6xl mb-5 font-black tracking-tight text-white leading-tight"
          >
            نموذج عن{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-300 via-violet-400 to-indigo-400">
              الشَّهادة
            </span>
          </motion.h2>

          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg text-slate-300/80 max-w-2xl mx-auto leading-relaxed font-normal"
          >
            وثيقة تُثبت جدارتك المهنيَّة، وتُعَد جواز مرورك لفرص وظيفيَّة ومشاريع حقيقيَّة في
            السُّوق الرَّقمي.
          </motion.p>
        </motion.div>

        {/* 
          3D Certificate Container (Desktop Hover + Mobile Touch Tracking)
        */}
        <motion.div
          ref={certificateRef}
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={
            isCertificateInView
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 50, scale: 0.96 }
          }
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center perspective-[2000px]"
        >
          {/* Interactive Hint Banner (fades out after user touches or hovers) */}
          <motion.div
            animate={{ opacity: hasInteracted ? 0 : 1, y: hasInteracted ? -10 : 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4 flex items-center gap-2 text-xs text-purple-400/90 bg-purple-500/10 border border-purple-500/20 px-3.5 py-1.5 rounded-full backdrop-blur-md pointer-events-none"
          >
            <HandPointing className="w-4 h-4 animate-bounce" weight="duotone" />
            <span>حرك المؤشر أو اضغط لمسًا للمعاينة التفاعلية ثلاثية الأبعاد</span>
          </motion.div>

          {/* Interactive Card */}
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
            className="relative w-full max-w-4xl rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/15 bg-slate-900/40 cursor-grab active:cursor-grabbing group touch-pan-y"
          >
            {/* Dynamic Light Glare Overlay */}
            <motion.div
              className={`absolute inset-0 z-20 pointer-events-none mix-blend-overlay transition-opacity duration-300 ${
                isPressed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{
                background: useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.45) 0%, transparent 60%)`,
              }}
            />

            {/* Glowing Active Border */}
            <div
              className={`absolute inset-0 z-10 pointer-events-none border-2 rounded-2xl md:rounded-3xl transition-all duration-500 ${
                isPressed
                  ? 'border-purple-400/60 shadow-[inset_0_0_60px_rgba(168,85,247,0.25)]'
                  : 'border-purple-500/0 group-hover:border-purple-400/40 group-hover:shadow-[inset_0_0_60px_rgba(168,85,247,0.15)]'
              }`}
            />

            {/* Floating Trust Verification Badge */}
            <div className="absolute top-4 inset-e-4 md:top-6 md:inset-e-6 z-30 flex items-center gap-2 bg-slate-950/70 border border-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-lg">
              <SealCheck className="w-4 h-4 md:w-5 md:h-5 text-purple-400" weight="fill" />
              <span className="text-[11px] md:text-xs font-semibold text-white/90">
                وثيقة معتمدة وموثقة
              </span>
            </div>

            {/* Certificate Image Component */}
            <LazyImage
              src="/certificate.png"
              webpSrc="/certificate.webp"
              alt="نموذج شهادة إتمام الدورة التدريبية معتمدة من رؤية رقمية"
              width={1200}
              height={848}
              className="w-full h-auto relative z-0 object-cover transform transition-transform duration-700"
              priority={true}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

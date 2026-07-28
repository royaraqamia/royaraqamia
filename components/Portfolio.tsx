'use client';

import { memo, Key, useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, useScroll, useSpring, useReducedMotion, LayoutGroup } from 'motion/react';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { SectionBackground } from './SectionBackground';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

const PORTFOLIO_IMAGE_COUNT = 25;
const IMAGE_FILENAME_PADDING = 2;

const PORTFOLIO_IMAGES = Array.from({ length: PORTFOLIO_IMAGE_COUNT }, (_, i) => {
  const num = (i + 1).toString().padStart(IMAGE_FILENAME_PADDING, '0');
  return { webp: `/${num}.webp`, png: `/${num}.png` };
});

const CARD_COUNT = 13;

const removedIndices = new Set([4, 7, 11, 19, 16, 8, 22, 17, 21, 23, 9, 15]);

const projectImages: Record<number, { webp: string; png: string }[]> = {
  0: [PORTFOLIO_IMAGES[0]!, PORTFOLIO_IMAGES[4]!],
  1: [PORTFOLIO_IMAGES[1]!, PORTFOLIO_IMAGES[7]!],
  2: [PORTFOLIO_IMAGES[2]!, PORTFOLIO_IMAGES[11]!],
  3: [PORTFOLIO_IMAGES[3]!, PORTFOLIO_IMAGES[9]!, PORTFOLIO_IMAGES[15]!],
  5: [PORTFOLIO_IMAGES[5]!, PORTFOLIO_IMAGES[8]!, PORTFOLIO_IMAGES[22]!],
  10: [PORTFOLIO_IMAGES[10]!, PORTFOLIO_IMAGES[16]!],
  13: [PORTFOLIO_IMAGES[13]!, PORTFOLIO_IMAGES[19]!],
  14: [PORTFOLIO_IMAGES[14]!, PORTFOLIO_IMAGES[17]!, PORTFOLIO_IMAGES[21]!, PORTFOLIO_IMAGES[23]!],
};

const visibleIndices = Array.from({ length: PORTFOLIO_IMAGE_COUNT }, (_, i) => i).filter(
  (i) => !removedIndices.has(i)
);

interface ProjectData {
  [x: string]: any;
  title: string;
}

const projectData: ProjectData[] = [
  {
    title: 'موقع عيادة أسنان',
  },
  {
    title: 'تطبيق عطور',
  },
  {
    title: 'متجر إلكتروني',
  },
  {
    title: 'موقع هدايا',
  },
  {
    title: 'موقع عيادة أسنان',
  },
  {
    title: 'تطبيق إلكترونيَّات وكهربائيَّات',
  },
  {
    title: 'موقع تحليل بيانات',
  },
  {
    title: 'تطبيق عطور',
  },
  {
    title: 'تطبيق إلكترونيَّات وكهربائيَّات',
  },
  {
    title: 'Dashboard لمتجر إلكتروني',
  },
  {
    title: 'تطبيق سيَّارات',
  },
  {
    title: 'واجهة المحادثة لمتجر إلكتروني',
  },
  {
    title: 'لوحة تصميم إشعارات',
  },
  {
    title: 'تطبيق سفريَّات',
  },
  {
    title: 'تطبيق استشارات قانونيَّة',
  },
  {
    title: 'هوية علامة مياه',
  },
  {
    title: 'حجز إلكتروني للسيارات',
  },
  {
    title: 'منصة لوجستية',
  },
  {
    title: 'لوحة إدارة أسعار',
  },
  {
    title: 'هوية مؤسسة خيرية',
  },
  {
    title: 'تطبيق إعلانات',
  },
  {
    title: 'منصة تحليلات',
  },
  {
    title: 'نادي رياضي',
  },
  {
    title: 'تطبيق إعلانات',
  },
  {
    title: 'تطبيق عقارات',
  },
];

// --- Framer Motion Variants ---
const headerVariant = {
  hidden: { opacity: 0, y: -40 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 70, damping: 20 } },
} as const;

const cardStagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, scale: 0.9, x: 50 },
  show: { opacity: 1, scale: 1, x: 0, transition: { type: 'spring', stiffness: 80, damping: 20 } },
} as const;

export const Portfolio = memo(function Portfolio() {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(400);
  const [imageError, setImageError] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setGalleryIndex(0);
  }, [selectedProject]);

  // Elite Detail: Scroll Progress Bar linked to the horizontal container
  const { scrollXProgress } = useScroll({ container: scrollContainerRef });
  const springScaleX = useSpring(scrollXProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  const scaleX = shouldReduceMotion ? scrollXProgress : springScaleX;

  const handleImageError = (index: number) => {
    setImageError((prev) => new Set(prev).add(index));
  };

  return (
    <section
      id="portfolio"
      className="py-24 md:py-32 relative overflow-hidden bg-[#050810] text-slate-100 select-none"
    >
      {/* Ambient Lighting & Background Layer */}
      <div className="absolute inset-0 z-0 opacity-90 pointer-events-none">
        <SectionBackground
          blobs={[
            {
              top: '0',
              left: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(168, 85, 247, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(-25%, -50%)',
              animation: 'pulse-slow 6s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(59, 130, 246, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(25%, 33%)',
              animation: 'pulse-slow 6s ease-in-out infinite',
              animationDelay: '1.5s',
            },
          ]}
        />
        {/* Radial glow gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />
        {/* Subtle noise overlay */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay" />
      </div>

      <LayoutGroup>
        <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
          {/* Section Header */}
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView={shouldReduceMotion ? undefined : 'show'}
            viewport={{ once: true, margin: '-100px' }}
            variants={headerVariant}
            className="text-center max-w-4xl mx-auto mb-12 sm:mb-16 flex flex-col items-center"
          >
            {/* Eyebrow Pill Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs sm:text-sm font-medium backdrop-blur-md mb-6 shadow-[0_0_20px_rgba(168,85,247,0.12)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
              <span className="tracking-wide">معرض الأعمال</span>
            </div>

            <h2 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.15]">
              نبذة عن{' '}
              <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-400 via-violet-300 to-indigo-400">
                أعمالنا
              </span>
            </h2>
            <p className="mt-4 sm:mt-6 text-sm sm:text-base lg:text-lg text-slate-400 max-w-2xl leading-relaxed font-normal">
              تصفَّح نُخبة من أهمِّ المشاريع الرَّقميَّة الـمُصمَّمَة بأعلى معايير الجودة.
            </p>
          </motion.div>
        </div>

        {/* Portfolio Horizontal Scroll Area */}
        <div className="relative w-full group/scroll z-10">
          {/* Section Controls Bar: Progress Bar & Navigation Arrows */}
          <div className="max-w-7xl mx-auto px-6 md:px-12 mb-6 sm:mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-medium text-purple-400/90">01</span>
                <div className="w-28 sm:w-44 h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-xs">
                  <motion.div
                    className="h-full bg-linear-to-r from-purple-500 via-violet-400 to-indigo-500 origin-right rounded-full shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                    style={{ scaleX }}
                  />
                </div>
                <span className="text-xs font-mono font-medium text-slate-500">
                  {CARD_COUNT.toString().padStart(2, '0')}
                </span>
              </div>
              <span className="text-xs text-slate-400/80 font-medium max-md:hidden">
                اسحب أو استخدم الأسهم للتَّنقُّل
              </span>
              <span className="text-xs text-slate-400/80 font-medium md:hidden">
                اسحب للتَّنقُّل
              </span>
            </div>

            <HorizontalScrollArrows
              onScroll={scroll}
              canScrollLeft={canScrollLeft}
              canScrollRight={canScrollRight}
              ariaLabelLeft="التَّالي"
              ariaLabelRight="السَّابق"
            />
          </div>

          {/* Horizontal Scroll Container */}
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView={shouldReduceMotion ? undefined : 'show'}
            viewport={{ once: true, margin: '-50px' }}
            variants={cardStagger}
            ref={scrollContainerRef}
            className="flex snap-x snap-mandatory overflow-x-auto pb-12 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none items-center touch-manipulation"
            style={{
              paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
              paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
              scrollPaddingInline: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
              gap: '32px',
            }}
            role="region"
            aria-label="معرض الأعمال"
          >
            {visibleIndices.map((actualIndex, displayIdx) => {
              if (imageError.has(actualIndex)) return null;
              const project = projectData[actualIndex]!;
              const imagePath = PORTFOLIO_IMAGES[actualIndex]!;

              return (
                <motion.div
                  key={actualIndex}
                  variants={cardVariant}
                  className="shrink-0 w-[85vw] sm:w-95 md:w-110 lg:w-120 min-w-0 snap-center group/card"
                >
                  <motion.div
                    onClick={() => setSelectedProject(actualIndex)}
                    className="relative group/card-inner rounded-3xl overflow-hidden bg-white/3 border border-white/10 transition-all duration-500 motion-reduce:transition-none hover:border-purple-500/40 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)] w-full aspect-4/3 cursor-pointer active:scale-[0.98] active:opacity-90 focus-visible:outline-2 focus-visible:outline-purple-400/80 focus-visible:outline-offset-4 backdrop-blur-md"
                    role="button"
                    tabIndex={0}
                    aria-label={`مشروع ${project.title}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProject(actualIndex);
                      }
                    }}
                  >
                    {/* Project Image */}
                    <Image
                      src={imagePath.webp}
                      alt={`${project.title} - رؤية رقمية`}
                      fill
                      unoptimized
                      loading={displayIdx < 3 ? 'eager' : 'lazy'}
                      sizes="(max-width: 640px) 85vw, (max-width: 768px) 380px, (max-width: 1024px) 440px, 480px"
                      className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-0 group-hover/card-inner:scale-105"
                      onError={() => handleImageError(actualIndex)}
                    />

                    {/* Dark Ambient Base Gradient */}
                    <div className="absolute inset-0 bg-linear-to-t from-[#050810] via-[#050810]/40 to-transparent transition-opacity duration-300" />

                    {/* Top Floating Badge & Project Number */}
                    <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10 pointer-events-none">
                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-[#050810]/70 backdrop-blur-md text-purple-300 border border-white/10 shadow-lg">
                        {project.category || 'مشروع رقمي'}
                      </span>
                      <span className="text-xs font-mono font-medium text-white/50 bg-[#050810]/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5">
                        #{(displayIdx + 1).toString().padStart(2, '0')}
                      </span>
                    </div>

                    {/* Default Bottom Title Bar */}
                    <div className="absolute bottom-0 inset-x-0 p-6 z-10 transition-all duration-300 group-hover/card-inner:opacity-0 group-hover/card-inner:translate-y-2">
                      <h3 className="text-white font-bold text-xl sm:text-2xl drop-shadow-md tracking-tight">
                        {project.title}
                      </h3>
                    </div>

                    {/* High-End Glassmorphic Hover Overlay */}
                    <div className="absolute inset-0 bg-[#050810]/90 backdrop-blur-md opacity-0 group-hover/card-inner:opacity-100 transition-all duration-300 motion-reduce:duration-0 flex flex-col justify-between p-6 sm:p-8 text-right z-20">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {project.category || 'مشروع رقمي'}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          #{(displayIdx + 1).toString().padStart(2, '0')}
                        </span>
                      </div>

                      <div className="my-auto py-2">
                        <h3 className="text-white font-bold text-2xl sm:text-3xl mb-2.5 bg-linear-to-r from-white via-slate-100 to-purple-200 bg-clip-text">
                          {project.title}
                        </h3>
                        {project.description && (
                          <p className="text-slate-300 text-sm sm:text-base leading-relaxed line-clamp-2">
                            {project.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-4">
                          {(project.metrics ?? []).map(
                            (_metric: any, mi: Key | null | undefined) => (
                              <div
                                key={mi}
                                className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 min-w-20 border border-white/10 text-xs text-purple-200"
                              />
                            )
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <span className="text-xs font-semibold text-purple-300 flex items-center gap-2 group-hover/card-inner:text-purple-200 transition-colors">
                          <span>عرض المشروع</span>
                          <svg
                            className="w-4 h-4 rotate-180"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M14 5l7 7m0 0l-7 7m7-7H3"
                            />
                          </svg>
                        </span>
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 group-hover/card-inner:bg-purple-500 group-hover/card-inner:text-white transition-all duration-300">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Modal Dialog */}
        <Dialog
          open={selectedProject !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedProject(null);
          }}
        >
          <DialogContent className="max-w-4xl w-[calc(100%-32px)] p-0 rounded-3xl bg-[#080c16]/95 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-purple-950/50 overflow-y-auto dialog-scrollbar max-md:inset-0 max-md:w-full max-md:translate-x-0 max-md:rounded-none max-md:h-dvh max-md:max-h-none max-md:border-0">
            {selectedProject !== null &&
              (() => {
                const project = projectData[selectedProject]!;
                const images = projectImages[selectedProject] ?? [
                  PORTFOLIO_IMAGES[selectedProject]!,
                ];
                const currentImage = images[galleryIndex]!;
                const hasMultipleImages = images.length > 1;

                const goToPrev = () =>
                  setGalleryIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                const goToNext = () =>
                  setGalleryIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));

                return (
                  <div className="flex flex-col h-full max-md:h-dvh">
                    <motion.div className="flex-1 min-h-0 flex items-center justify-center bg-linear-to-b from-purple-900/10 via-black/20 to-black/40 p-4 sm:p-8 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.08)_0,transparent_70%)] pointer-events-none" />
                      <Image
                        key={galleryIndex}
                        src={currentImage.webp}
                        alt={project.title}
                        width={1600}
                        height={1152}
                        unoptimized
                        className="max-h-full max-w-full object-contain w-auto h-auto rounded-2xl shadow-2xl relative z-10"
                        sizes="(max-width: 768px) 100vw, 900px"
                      />
                      {hasMultipleImages && (
                        <>
                          <button
                            onClick={goToPrev}
                            className="absolute inset-s-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-purple-600/70 hover:border-purple-500/50 transition-all duration-300"
                            aria-label="السابق"
                            type="button"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={goToNext}
                            className="absolute inset-e-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-purple-600/70 hover:border-purple-500/50 transition-all duration-300"
                            aria-label="التالي"
                            type="button"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                              />
                            </svg>
                          </button>
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                            {images.map((_, imgIdx) => (
                              <button
                                key={imgIdx}
                                onClick={() => setGalleryIndex(imgIdx)}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                  imgIdx === galleryIndex
                                    ? 'bg-purple-400 w-5'
                                    : 'bg-white/30 hover:bg-white/60'
                                }`}
                                aria-label={`الصورة ${imgIdx + 1}`}
                                type="button"
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </motion.div>
                    <div className="p-6 sm:p-8 pt-5 sm:pt-6 shrink-0 bg-[#080c16] border-t border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {project.category || 'مشروع رقمي'}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          #
                          {(visibleIndices.indexOf(selectedProject) + 1)
                            .toString()
                            .padStart(2, '0')}
                        </span>
                      </div>
                      <DialogTitle className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
                        {project.title}
                      </DialogTitle>
                      {project.description && (
                        <DialogDescription className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
                          {project.description}
                        </DialogDescription>
                      )}
                    </div>
                  </div>
                );
              })()}
          </DialogContent>
        </Dialog>
      </LayoutGroup>
    </section>
  );
});

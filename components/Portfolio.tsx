'use client';

import { memo, Key, useState } from 'react';
import Image from 'next/image';
import { motion, useScroll, useSpring } from 'motion/react';
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

interface ProjectData {
  [x: string]: any;
  title: string;
}

const projectData: ProjectData[] = [
  {
    title: 'متجر إلكتروني',
  },
  {
    title: 'تطبيق بنكي',
  },
  {
    title: 'منصة تعليمية',
  },
  {
    title: 'هوية متجر أزياء',
  },
  {
    title: 'منصة عقارية',
  },
  {
    title: 'تطبيق لياقة',
  },
  {
    title: 'موقع طبي',
  },
  {
    title: 'هوية مطعم',
  },
  {
    title: 'تطبيق توصيل',
  },
  {
    title: 'منصة سحابية',
  },
  {
    title: 'متجر أزياء',
  },
  {
    title: 'هوية شركة تقنية',
    description: 'هوية بصرية حديثة لشركة تقنية ناشئة',
    category: 'هويات',
  },
  {
    title: 'تطبيق سفر',
  },
  {
    title: 'منصة توظيف',
  },
  {
    title: 'موقع فندقي',
  },
  {
    title: 'هوية علامة مياه',
  },
  {
    title: 'تطبيق موسيقى',
  },
  {
    title: 'منصة لوجستية',
  },
  {
    title: 'متجر إلكتروني',
  },
  {
    title: 'هوية مؤسسة خيرية',
  },
  {
    title: 'تطبيق مطبخ',
  },
  {
    title: 'منصة تحليلات',
  },
  {
    title: 'نادي رياضي',
  },
  {
    title: 'هوية متجر إلكتروني',
  },
  {
    title: 'تطبيق صحي',
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

  // Elite Detail: Scroll Progress Bar linked to the horizontal container
  const { scrollXProgress } = useScroll({ container: scrollContainerRef });
  const scaleX = useSpring(scrollXProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const handleImageError = (index: number) => {
    setImageError((prev) => new Set(prev).add(index));
  };

  return (
    <section id="portfolio" className="py-24 relative overflow-hidden bg-[#050810]">
      {/* Background Layer */}
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
        {/* Subtle noise texture for premium depth */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={headerVariant}
          className="text-center max-w-4xl mx-auto mb-16 flex flex-col items-center"
        >
          <h2 className="text-5xl sm:text-6xl lg:text-7xl mb-6 font-extrabold tracking-tight text-white">
            نبذة عن{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-400 via-violet-400 to-indigo-400">
              أعمالنا
            </span>
          </h2>
        </motion.div>
      </div>

      {/* Portfolio Horizontal Scroll Area */}
      <div className="relative w-full group/scroll z-10">
        {/* Elite Detail: Animated Scroll Progress Indicator */}
        <div className="max-w-7xl mx-auto px-6 md:px-12 mb-6 flex items-center justify-between">
          <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden max-w-50 ml-auto">
            <motion.div
              className="h-full bg-linear-to-r from-violet-500 to-purple-500 origin-right"
              style={{ scaleX }} // Tied to horizontal scroll progress
            />
          </div>

          <HorizontalScrollArrows
            onScroll={scroll}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            ariaLabelLeft="التالي"
            ariaLabelRight="السابق"
          />
        </div>

        {/* Scroll Container */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          variants={cardStagger}
          ref={scrollContainerRef}
          className="flex snap-x snap-mandatory overflow-x-auto pb-12 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none items-center"
          style={{
            paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
            paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
            scrollPaddingInline: 'max(24px, calc((100vw - 1280px) / 2 + 24px))',
            gap: '32px',
          }}
          role="region"
          aria-label="معرض الأعمال"
        >
          {PORTFOLIO_IMAGES.map((imagePath, index) => {
            if (imageError.has(index)) return null;
            const project = projectData[index]!;

            return (
              <motion.div
                key={index}
                variants={cardVariant}
                className="shrink-0 w-[85vw] sm:w-90 md:w-120 lg:w-135 min-w-0 snap-center"
              >
                <div
                  onClick={() => setSelectedProject(index)}
                  className="relative group/card rounded-4xl overflow-hidden bg-white/2 border border-white/10 transition-all duration-700 hover:border-white/30 hover:shadow-[0_0_40px_-15px_rgba(139,92,246,0.3)] w-full aspect-4/3 cursor-pointer"
                >
                  <Image
                    src={imagePath.png}
                    alt={`${project.title} - رؤية رقمية`}
                    fill
                    loading={index < 3 ? 'eager' : 'lazy'}
                    sizes="(max-width: 640px) 85vw, (max-width: 768px) 360px, (max-width: 1024px) 480px, 540px"
                    className="object-cover transition-transform duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover/card:scale-105 group-hover/card:rotate-1"
                    onError={() => handleImageError(index)}
                  />

                  <div className="absolute inset-0 bg-linear-to-t from-[#050810]/80 via-transparent to-transparent" />

                  <div className="absolute inset-0 bg-[#050810]/90 backdrop-blur-sm opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 flex flex-col justify-center items-center p-6 text-center">
                    <h3 className="text-white font-bold text-xl mb-3">{project.title}</h3>
                    <p className="text-white/60 text-sm mb-5 line-clamp-2">{project.description}</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(project.metrics ?? []).map((_metric: any, mi: Key | null | undefined) => (
                        <div
                          key={mi}
                          className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 min-w-24 border border-white/10"
                        ></div>
                      ))}
                    </div>
                  </div>

                  {/* "View Project" Pill */}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <Dialog
        open={selectedProject !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProject(null);
        }}
      >
        <DialogContent
          className="max-w-4xl w-[calc(100%-32px)] p-0 rounded-3xl bg-[#0a0e1a] border border-white/10"
          aria-describedby={undefined}
        >
          {selectedProject !== null &&
            (() => {
              const project = projectData[selectedProject]!;
              const image = PORTFOLIO_IMAGES[selectedProject]!;
              return (
                <>
                  <div className="w-full">
                    <Image
                      src={image.png}
                      alt={project.title}
                      width={1200}
                      height={800}
                      className="w-full h-auto"
                      sizes="(max-width: 768px) 100vw, 900px"
                    />
                  </div>
                  <div className="p-6 sm:p-8 pt-4 sm:pt-6">
                    <DialogTitle className="text-2xl sm:text-3xl font-bold text-white mb-3">
                      {project.title}
                    </DialogTitle>
                    <DialogDescription className="text-white/60 text-base leading-relaxed">
                      {project.description}
                    </DialogDescription>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </section>
  );
});

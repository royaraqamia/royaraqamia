'use client';

import { memo, useState } from 'react';
import { m, useScroll, useSpring, useReducedMotion, LayoutGroup } from 'motion/react';
import { useHorizontalScroll } from '../../shared/use-horizontal-scroll';
import { HorizontalScrollArrows } from '../HorizontalScrollArrows';
import { SectionBackground } from '../SectionBackground';
import {
  CARD_COUNT,
  projectData,
  visibleIndices,
  PORTFOLIO_IMAGES,
  cardStagger,
} from './portfolio-data';
import { PortfolioSectionHeader } from './portfolio-section-header';
import { PortfolioCard } from './portfolio-card';
import { PortfolioGalleryDialog } from './portfolio-gallery-dialog';

export const Portfolio = memo(function Portfolio() {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(400);
  const [imageError, setImageError] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

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
          <PortfolioSectionHeader shouldReduceMotion={shouldReduceMotion} />
        </div>

        {/* Portfolio Horizontal Scroll Area */}
        <div className="relative w-full group/scroll z-10">
          {/* Section Controls Bar: Progress Bar & Navigation Arrows */}
          <div className="max-w-7xl mx-auto px-6 md:px-12 mb-6 sm:mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-medium text-purple-400/90">01</span>
                <div className="w-28 sm:w-44 h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-xs">
                  <m.div
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
          <m.div
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
                <PortfolioCard
                  key={actualIndex}
                  actualIndex={actualIndex}
                  displayIdx={displayIdx}
                  project={project}
                  imagePath={imagePath}
                  onSelect={setSelectedProject}
                  onImageError={handleImageError}
                />
              );
            })}
          </m.div>
        </div>

        {/* Modal Dialog */}
        <PortfolioGalleryDialog
          selectedProject={selectedProject}
          galleryIndex={galleryIndex}
          onGalleryIndexChange={setGalleryIndex}
          onClose={() => setSelectedProject(null)}
        />
      </LayoutGroup>
    </section>
  );
});

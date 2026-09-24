'use client';

import { memo, useState } from 'react';
import { useHorizontalScroll } from '../../shared/use-horizontal-scroll';
import { HorizontalScrollArrows } from '../HorizontalScrollArrows';
import { projectData, visibleIndices, PORTFOLIO_IMAGES } from './portfolio-data';
import { PortfolioSectionHeader } from './portfolio-section-header';
import { PortfolioCard } from './portfolio-card';
import { PortfolioGalleryDialog } from './portfolio-gallery-dialog';

export const Portfolio = memo(function Portfolio() {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(400);
  const [imageError, setImageError] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const handleImageError = (index: number) => {
    setImageError((prev) => new Set(prev).add(index));
  };

  return (
    <section
      id="portfolio"
      className="py-24 md:py-32 relative overflow-hidden bg-[#050810] text-slate-100 select-none"
    >
      {/* Background Layer */}
      <div className="absolute inset-0 z-0 opacity-90 pointer-events-none">
        {/* Subtle noise overlay */}
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/20" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <PortfolioSectionHeader />
      </div>

      {/* Portfolio Horizontal Scroll Area */}
      <div className="relative w-full group/scroll z-10">
        {/* Section Controls Bar: Progress Bar & Navigation Arrows */}
        <div className="max-w-7xl mx-auto px-6 md:px-12 mb-6 sm:mb-8 flex flex-col sm:flex-row items-center justify-end gap-4">
          <HorizontalScrollArrows
            onScroll={scroll}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            ariaLabelLeft="التَّالي"
            ariaLabelRight="السَّابق"
          />
        </div>

        {/* Horizontal Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="flex snap-x snap-mandatory overflow-x-auto pb-12 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none items-center touch-manipulation is-visible"
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
        </div>
      </div>

      {/* Modal Dialog */}
      <PortfolioGalleryDialog
        selectedProject={selectedProject}
        galleryIndex={galleryIndex}
        onGalleryIndexChange={setGalleryIndex}
        onClose={() => setSelectedProject(null)}
      />
    </section>
  );
});

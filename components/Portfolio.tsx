'use client';

import { ScrollAnimation } from './ScrollAnimations';
import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';

const PORTFOLIO_IMAGE_COUNT = 25;
const IMAGE_FILENAME_PADDING = 2;

const PORTFOLIO_IMAGES = Array.from({ length: PORTFOLIO_IMAGE_COUNT }, (_, i) => {
  const num = (i + 1).toString().padStart(IMAGE_FILENAME_PADDING, '0');
  return {
    webp: `/${num}.webp`,
    png: `/${num}.png`,
  };
});

export function Portfolio() {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(400);
  const [imageError, setImageError] = useState<Set<number>>(new Set());
  const [hoveredArrow, setHoveredArrow] = useState<'left' | 'right' | null>(null);

  const handleImageError = (index: number) => {
    setImageError((prev) => new Set(prev).add(index));
  };

  return (
    <section id="portfolio" className="section-spacing relative overflow-hidden">
      {/* Background with Purple/Blue Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-purple-500/10 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-blue-500/10 rounded-full blur-[100px] translate-y-1/3 translate-x-1/4 animate-pulse-slow delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-teal-500/5 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 animate-pulse-slow delay-2000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              نبذة عن <span className="gradient-text">أعمالنا</span>
            </h2>
          </div>
        </ScrollAnimation>
      </div>

      {/* Portfolio Horizontal Scroll - Full Width with Edge Navigation */}
      <ScrollAnimation animation="slide-up" duration={0.7} delay={0.2}>
        <div className="relative w-full group/scroll">
          {/* Left Navigation Arrow - Desktop */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110"
              onMouseEnter={() => setHoveredArrow('left')}
              onMouseLeave={() => setHoveredArrow(null)}
              style={{
                backgroundColor: hoveredArrow === 'left' ? '#7766EE' : 'rgba(0, 0, 0, 0.6)',
                borderColor: hoveredArrow === 'left' ? '#7766EE' : 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(8px)',
              }}
              aria-label="التالي"
              type="button"
            >
              <CaretLeft className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Right Navigation Arrow - Desktop */}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110"
              onMouseEnter={() => setHoveredArrow('right')}
              onMouseLeave={() => setHoveredArrow(null)}
              style={{
                backgroundColor: hoveredArrow === 'right' ? '#7766EE' : 'rgba(0, 0, 0, 0.6)',
                borderColor: hoveredArrow === 'right' ? '#7766EE' : 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(8px)',
              }}
              aria-label="السابق"
              type="button"
            >
              <CaretRight className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Scroll Container */}
          <div
            ref={scrollContainerRef}
            className="horizontal-scroll pt-2 md:pt-4 pb-12 flex"
            style={{
              paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
              paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
              scrollPaddingInline: '80px',
              gap: '24px',
            }}
            role="region"
            aria-label="معرض الأعمال"
          >
            {PORTFOLIO_IMAGES.map((imagePath, index) => {
              if (imageError.has(index)) return null;

              return (
                <div key={index} className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px]">
                  <div className="relative group/card rounded-2xl overflow-hidden glass-card border border-white/10 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 hover:border-purple-500/30">
                    <picture>
                      <source srcSet={imagePath.webp} type="image/webp" />
                      <img
                        src={imagePath.png}
                        alt={`Portfolio project ${index + 1}`}
                        loading="lazy"
                        width={360}
                        height={240}
                        className="w-full h-auto object-contain"
                        onError={() => handleImageError(index)}
                      />
                    </picture>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollAnimation>
    </section>
  );
}

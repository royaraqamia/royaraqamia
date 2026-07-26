'use client';

import Image from 'next/image';
import { ScrollAnimation } from './ScrollAnimations';
import { useState } from 'react';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { SectionBackground } from './SectionBackground';

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

  const handleImageError = (index: number) => {
    setImageError((prev) => new Set(prev).add(index));
  };

  return (
    <section id="portfolio" className="section-spacing relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <SectionBackground
          blobs={[
            {
              top: '0',
              left: '0',
              width: '400px',
              height: '400px',
              background: 'rgba(168, 85, 247, 0.12)',
              filter: 'blur(100px)',
              transform: 'translate(-25%, -50%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '400px',
              height: '400px',
              background: 'rgba(59, 130, 246, 0.12)',
              filter: 'blur(100px)',
              transform: 'translate(25%, 33%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
              animationDelay: '1s',
            },
            {
              top: '50%',
              left: '50%',
              width: '300px',
              height: '300px',
              background: 'rgba(20, 184, 166, 0.08)',
              filter: 'blur(120px)',
              transform: 'translate(-50%, -50%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
              animationDelay: '2s',
            },
          ]}
        />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header - Upgraded Typography */}
        <ScrollAnimation animation="slide-down" duration={0.8}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2 className="text-4xl sm:text-6xl lg:text-7xl mb-4 font-bold tracking-tight text-white/95">
              نبذة عن <span className="gradient-text">أعمالنا</span>
            </h2>
          </div>
        </ScrollAnimation>
      </div>

      {/* Portfolio Horizontal Scroll - Full Width with Edge Navigation */}
      <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
        <div className="relative w-full group/scroll">
          <HorizontalScrollArrows
            onScroll={scroll}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            ariaLabelLeft="التالي"
            ariaLabelRight="السابق"
          />

          {/* Scroll Container - Added snap scrolling and CSS hidden scrollbar */}
          <div
            ref={scrollContainerRef}
            className="horizontal-scroll pt-2 md:pt-4 pb-12 flex snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none"
            style={{
              paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
              paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
              scrollPaddingInline: '80px',
              gap: '32px', // Slightly increased gap for premium breathing room
            }}
            role="region"
            aria-label="معرض الأعمال"
          >
            {PORTFOLIO_IMAGES.map((imagePath, index) => {
              if (imageError.has(index)) return null;

              return (
                <div key={index} className="shrink-0 w-70 sm:w-90 md:w-120 min-w-0 snap-center">
                  {/* Card Container: Fixed bounds, subtle border, overflow hidden */}
                  <div className="relative group/card rounded-3xl overflow-hidden bg-white/2 border border-white/5 transition-colors duration-500 hover:border-white/20 w-full aspect-4/3 shadow-2xl">
                    {/* The Image: Object cover, inner scale on hover, premium cubic-bezier easing */}
                    <Image
                      src={imagePath.png}
                      alt={`معرض أعمال رؤية رقمية - مشروع ${index + 1}`}
                      fill
                      sizes="(max-width: 768px) 280px, (max-width: 1200px) 360px, 480px"
                      className="object-cover transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-110 group-hover/card:-rotate-1"
                      onError={() => handleImageError(index)}
                    />

                    {/* Premium Touch: Dark gradient overlay that fades in from the bottom on hover */}
                    <div className="absolute inset-0 bg-linear-to-t from-[#0B0F19]/90 via-[#0B0F19]/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]" />

                    {/* Premium Touch: "View Project" Pill. Using start-6 to support RTL naturally */}
                    <div className="absolute bottom-6 inset-s-6 translate-y-6 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 transition-all duration-600 ease-[cubic-bezier(0.25,1,0.5,1)] delay-75">
                      <span className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm font-medium text-white shadow-xl">
                        عرض العمل
                        <svg
                          className="w-4 h-4 rtl:rotate-180"
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
                    </div>
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

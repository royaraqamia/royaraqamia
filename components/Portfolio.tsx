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
              background: 'rgba(168, 85, 247, 0.1)',
              filter: 'blur(100px)',
              transform: 'translate(-25%, -50%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '400px',
              height: '400px',
              background: 'rgba(59, 130, 246, 0.1)',
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
              background: 'rgba(20, 184, 166, 0.05)',
              filter: 'blur(120px)',
              transform: 'translate(-50%, -50%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
              animationDelay: '2s',
            },
          ]}
        />
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
          <HorizontalScrollArrows
            onScroll={scroll}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            ariaLabelLeft="التالي"
            ariaLabelRight="السابق"
          />

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
                <div
                  key={index}
                  className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] min-w-0"
                >
                  <div className="relative group/card rounded-2xl overflow-hidden glass-card border border-white/10 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 hover:border-purple-500/30 w-full">
                    <Image
                      src={imagePath.png}
                      alt={`معرض أعمال رؤية رقمية - مشروع ${index + 1}`}
                      width={360}
                      height={240}
                      className="w-full h-auto object-contain"
                      onError={() => handleImageError(index)}
                    />
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

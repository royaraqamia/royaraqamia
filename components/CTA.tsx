'use client';

import { ScrollAnimation } from './ScrollAnimations';
import { ArrowLeft } from '@phosphor-icons/react';

import { getWhatsAppUrl } from '../lib/constants';

export function CTA() {
  return (
    <>
      <section
        id="cta"
        className="relative py-24 md:py-32 overflow-hidden items-center justify-center flex"
      >
        {/* Background with Gradient - matching Hero section */}
        <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-purple-950 to-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-primary-600/5 to-transparent" />
          <div className="absolute top-0 right-1/4 w-[min(600px,80vw)] h-[min(600px,80vw)] bg-primary-600 opacity-5 blur-[150px] rounded-full" />
          <div className="absolute bottom-0 left-1/4 w-[min(600px,80vw)] h-[min(600px,80vw)] bg-primary-400 opacity-5 blur-[150px] rounded-full" />
        </div>

        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollAnimation animation="slide-up" duration={0.8}>
            <div className="relative max-w-5xl mx-auto">
              <div className="relative px-6 py-12 md:px-12 md:py-20 lg:py-24 text-center">
                {/* Badge component - Matching Hero style */}
                <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-slate-900/50 backdrop-blur-md text-white border border-slate-700/50 relative overflow-hidden group hover:border-primary-500/30 transition-colors duration-300">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="text-sm font-medium text-slate-200">متاحون للرَّد 24/7</span>

                  {/* Subtle sheen */}
                  <div className="absolute inset-0 w-full h-full bg-linear-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shine-slide_1.5s_infinite]" />
                </div>

                {/* Title - Matching Hero Typography */}
                <h2 className="text-5xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight font-arabic text-teal-300 mb-6 leading-snug md:leading-relaxed">
                  لا تترك مستقبلك للصُّدفة
                </h2>

                {/* Description - Matching Hero Typography */}
                <p
                  className="text-sm sm:text-base lg:text-lg text-white/90 max-w-2xl mx-auto mb-10 leading-[1.8] sm:leading-[1.9] text-shadow-hero px-2 sm:px-0 font-light"
                  style={{ letterSpacing: '0.01em' }}
                >
                  الفرص لا تنتظر، ابدأ الآن في بناء مسارك المهني أو مشروعك الخاص بدعم من نخبة
                  الخبراء.
                </p>

                {/* Action Buttons - Matching Hero Button Style */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                  <a
                    href={getWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="تواصل معنا عبر واتساب"
                    className="primary-cta-btn cta-glow relative overflow-hidden h-14 sm:h-16 w-full sm:w-auto max-w-full shrink-0 flex items-center justify-center px-6 sm:px-12 rounded-full gradient-primary text-white text-base sm:text-xl font-bold transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <span className="relative flex items-center gap-3 z-10">
                      تواصل معنا الآن
                      <ArrowLeft className="w-6 h-6 transition-transform duration-300 group-hover:-translate-x-1" />
                    </span>
                    {/* Shine effect on hover */}
                    <span className="shine-effect absolute inset-0 -translate-x-full transition-transform duration-700 bg-linear-to-r from-transparent via-white/25 to-transparent" />
                  </a>
                </div>
              </div>

              {/* No card background/border as per Hero style which is open on the background */}
            </div>
          </ScrollAnimation>
        </div>
      </section>
    </>
  );
}

'use client';

import { motion } from 'motion/react';
import { headerVariant } from './portfolio-data';

export function PortfolioSectionHeader({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean | null;
}) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : 'hidden'}
      whileInView={shouldReduceMotion ? undefined : 'show'}
      viewport={{ once: true, margin: '-100px' }}
      variants={headerVariant}
      className="text-center max-w-4xl mx-auto mb-12 sm:mb-16 flex flex-col items-center"
    >
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
  );
}

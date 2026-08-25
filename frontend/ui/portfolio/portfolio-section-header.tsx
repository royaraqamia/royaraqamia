'use client';

import { m } from 'motion/react';
import { headerVariant } from './portfolio-data';

export function PortfolioSectionHeader({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean | null;
}) {
  return (
    <m.div
      initial={shouldReduceMotion ? false : 'hidden'}
      whileInView={shouldReduceMotion ? undefined : 'show'}
      viewport={{ once: true, margin: '-100px' }}
      variants={headerVariant}
      className="text-center max-w-4xl mx-auto mb-12 sm:mb-16 flex flex-col items-center"
    >
      <h2 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.15]">
        نبذة عن{' '}
        <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-400 via-violet-300 to-indigo-400">
          أعمالنا
        </span>
      </h2>
    </m.div>
  );
}

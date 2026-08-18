'use client';

import { Key } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cardVariant, type ProjectData } from './portfolio-data';

interface PortfolioCardProps {
  actualIndex: number;
  displayIdx: number;
  project: ProjectData;
  imagePath: { webp: string };
  onSelect: (index: number) => void;
  onImageError: (index: number) => void;
}

export function PortfolioCard({
  actualIndex,
  displayIdx,
  project,
  imagePath,
  onSelect,
  onImageError,
}: PortfolioCardProps) {
  return (
    <motion.div
      variants={cardVariant}
      className="shrink-0 w-[85vw] sm:w-95 md:w-110 lg:w-120 min-w-0 snap-center group/card bg-[#050810] rounded-3xl overflow-hidden"
    >
      <motion.div
        onClick={() => onSelect(actualIndex)}
        className="relative group/card-inner rounded-3xl overflow-hidden bg-white/3 border border-white/10 transition-all duration-500 motion-reduce:transition-none hover:border-purple-500/40 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)] w-full aspect-4/3 cursor-pointer active:scale-[0.98] active:opacity-90 focus-visible:outline-2 focus-visible:outline-purple-400/80 focus-visible:outline-offset-4 backdrop-blur-md"
        role="button"
        tabIndex={0}
        aria-label={`مشروع ${project.title}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(actualIndex);
          }
        }}
      >
        <Image
          src={imagePath.webp}
          alt={`${project.title} - رؤية رقمية`}
          fill
          loading="lazy"
          sizes="(max-width: 640px) 85vw, (max-width: 768px) 380px, (max-width: 1024px) 440px, 480px"
          className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-0 group-hover/card-inner:scale-105"
          onError={() => onImageError(actualIndex)}
        />

        <div className="absolute inset-0 bg-linear-to-t from-[#050810] via-[#050810]/40 to-transparent transition-opacity duration-300" />

        <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10 pointer-events-none">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-[#050810]/70 backdrop-blur-md text-purple-300 border border-white/10 shadow-lg">
            {project.category || 'مشروع رقمي'}
          </span>
          <span className="text-xs font-mono font-medium text-white/50 bg-[#050810]/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5">
            #{(displayIdx + 1).toString().padStart(2, '0')}
          </span>
        </div>

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
              {(project.metrics ?? []).map((_metric: string, mi: Key | null | undefined) => (
                <div
                  key={mi}
                  className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 min-w-20 border border-white/10 text-xs text-purple-200"
                />
              ))}
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <h3 className="text-white font-bold text-xl sm:text-2xl mt-4 text-center leading-snug">
        {project.title}
      </h3>
    </motion.div>
  );
}

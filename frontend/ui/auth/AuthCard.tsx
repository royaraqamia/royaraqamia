'use client';

import { m } from 'motion/react';
import type { ReactNode } from 'react';

interface AuthCardProps {
  children: ReactNode;
  title: string;
  description?: ReactNode;
}

export function AuthCard({ children, title, description }: AuthCardProps) {
  return (
    <div className="relative w-full max-w-md mx-auto px-4 sm:px-0">
      {/* Dynamic Motion Ambient Background Glowing Orbs */}
      <m.div
        animate={{
          y: [0, -12, 0],
          scale: [1, 1.05, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="pointer-events-none absolute -top-20 -right-20 -z-10 h-64 w-64 rounded-full bg-linear-to-br from-indigo-500/25 via-purple-500/20 to-pink-500/10 blur-3xl sm:h-80 sm:w-80"
        aria-hidden="true"
      />
      <m.div
        animate={{
          y: [0, 12, 0],
          scale: [1, 1.08, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
        className="pointer-events-none absolute -bottom-16 -left-16 -z-10 h-56 w-56 rounded-full bg-linear-to-tr from-blue-600/20 via-cyan-500/15 to-indigo-500/20 blur-3xl sm:h-72 sm:w-72"
        aria-hidden="true"
      />

      {/* Main Glassmorphic Gradient Border Card Outer Container */}
      <m.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="group relative overflow-hidden rounded-3xl p-px bg-linear-to-b from-zinc-200/80 via-zinc-200/30 to-zinc-200/10 dark:from-zinc-700/60 dark:via-zinc-800/30 dark:to-zinc-900/20 shadow-2xl shadow-zinc-950/5 dark:shadow-black/50 transition-all duration-500 hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/10"
      >
        {/* Specular Top Border Edge Highlight */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-indigo-500/50 to-transparent dark:via-indigo-400/60 transition-opacity duration-500"
          aria-hidden="true"
        />

        {/* Card Inner Backdrop Surface */}
        <div className="relative rounded-[calc(1.5rem-1px)] bg-white/85 dark:bg-zinc-900/85 backdrop-blur-2xl p-6 sm:p-8 md:p-10 ring-1 ring-zinc-950/5 dark:ring-white/10 transition-colors duration-300">
          {/* Top Radial Highlight Mesh */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-indigo-500/6 dark:from-indigo-400/8 via-purple-500/2 to-transparent rounded-t-[calc(1.5rem-1px)]"
            aria-hidden="true"
          />

          {/* Header Section */}
          <m.header
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 text-center mb-8 sm:mb-10"
          >
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 font-sans">
              {title}
            </h1>
            {description && (
              <div className="mt-2.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 font-normal leading-relaxed">
                {description}
              </div>
            )}
          </m.header>

          {/* Main Content Body */}
          <m.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10"
          >
            {children}
          </m.section>
        </div>
      </m.div>
    </div>
  );
}

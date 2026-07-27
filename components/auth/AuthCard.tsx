'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface AuthCardProps {
  children: ReactNode;
  title: string;
  description?: ReactNode;
}

export function AuthCard({ children, title, description }: AuthCardProps) {
  return (
    <div className="relative w-full max-w-md">
      {/* Decorative gradient orbs */}
      <div className="absolute -top-20 -right-20 size-60 rounded-full bg-primary/20 blur-[100px] animate-float pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-accent-indigo/15 blur-[80px] animate-float-delayed pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="gradient-border"
      >
        <div className="gradient-border-content p-8 sm:p-10">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">{title}</h1>
            {description && <p className="text-muted-foreground mt-2">{description}</p>}
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { cn } from '@/frontend/shared/cn';

/**
 * Embedded CSS keyframes component providing zero-config, ultra-smooth sweep animation
 */
function SkeletonStyleSheet() {
  return (
    <style>{`
      @keyframes skeleton-shimmer-sweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  );
}

export interface SkeletonProps extends React.ComponentProps<'div'> {
  /**
   * Animation loading style
   * @default 'shimmer'
   */
  variant?: 'shimmer' | 'pulse' | 'none';
  /**
   * Animation sweep speed
   * @default 'normal'
   */
  speed?: 'fast' | 'normal' | 'slow';
  /**
   * Border radius design token
   * @default 'xl'
   */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /**
   * Accessible loading string for screen readers
   * @default 'Loading content...'
   */
  ariaLabel?: string;
}

const roundedClasses: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

/**
 * Core Skeleton Loader Component
 * Premium SaaS aesthetic inspired by Linear and Vercel.
 */
function Skeleton({
  className,
  variant = 'shimmer',
  speed = 'normal',
  rounded = 'xl',
  ariaLabel = 'Loading content...',
  children,
  ...props
}: SkeletonProps) {
  const speedDuration =
    speed === 'fast'
      ? 'before:animate-[skeleton-shimmer-sweep_1.1s_cubic-bezier(0.4,0,0.2,1)_infinite]'
      : speed === 'slow'
        ? 'before:animate-[skeleton-shimmer-sweep_2.5s_cubic-bezier(0.4,0,0.2,1)_infinite]'
        : 'before:animate-[skeleton-shimmer-sweep_1.7s_cubic-bezier(0.4,0,0.2,1)_infinite]';

  return (
    <>
      <SkeletonStyleSheet />
      <div
        role="status"
        aria-label={ariaLabel}
        aria-busy="true"
        className={cn(
          // Baseline structural & theme tokens
          'relative overflow-hidden select-none pointer-events-none',
          'bg-neutral-200/60 dark:bg-neutral-800/60',
          'border border-neutral-300/40 dark:border-neutral-700/40',
          'backdrop-blur-xs transition-opacity duration-300 ease-out',
          roundedClasses[rounded],

          // Pulse animation option
          variant === 'pulse' && [
            'animate-pulse',
            speed === 'fast' && 'duration-750',
            speed === 'normal' && 'duration-1500',
            speed === 'slow' && 'duration-2500',
          ],

          // Tailwind CSS v4 native shimmer sweep overlay
          variant === 'shimmer' && [
            'before:absolute before:inset-0 before:-translate-x-full',
            'before:bg-linear-to-r before:from-transparent before:via-neutral-100/90 dark:before:via-neutral-700/60 before:to-transparent',
            speedDuration,
          ],

          className
        )}
        {...props}
      >
        <span className="sr-only">{ariaLabel}</span>
        {children}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                         PRESET SKELETON COMPONENTS                         */
/* -------------------------------------------------------------------------- */

export interface SkeletonTextProps extends React.ComponentProps<'div'> {
  lines?: number;
  gap?: string;
  lastLineWidth?: string;
}

/**
 * Helper component for rendering multi-line paragraph skeletons
 */
function SkeletonText({
  lines = 3,
  gap = 'gap-2.5',
  lastLineWidth = 'w-3/4',
  className,
  ...props
}: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col w-full', gap, className)} {...props}>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={idx}
          rounded="md"
          className={cn('h-3.5 w-full', idx === lines - 1 && lastLineWidth)}
        />
      ))}
    </div>
  );
}

export interface SkeletonAvatarProps extends React.ComponentProps<'div'> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
}

const avatarSizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

/**
 * Helper component for circular or rounded profile avatar skeletons
 */
function SkeletonAvatar({
  size = 'md',
  shape = 'circle',
  className,
  ...props
}: SkeletonAvatarProps) {
  return (
    <Skeleton
      rounded={shape === 'circle' ? 'full' : 'xl'}
      className={cn('shrink-0', avatarSizes[size], className)}
      {...props}
    />
  );
}

export interface SkeletonButtonProps extends React.ComponentProps<'div'> {
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const buttonSizes = {
  sm: 'h-8 px-4',
  md: 'h-10 px-5',
  lg: 'h-12 px-6',
};

/**
 * Helper component for action button skeletons
 */
function SkeletonButton({
  size = 'md',
  fullWidth = false,
  className,
  ...props
}: SkeletonButtonProps) {
  return (
    <Skeleton
      rounded="lg"
      className={cn(buttonSizes[size], fullWidth ? 'w-full' : 'w-28', className)}
      {...props}
    />
  );
}

export interface SkeletonCardProps extends React.ComponentProps<'div'> {
  hasHeader?: boolean;
  hasFooter?: boolean;
}

/**
 * High-end card skeleton container with customizable layout slots
 */
function SkeletonCard({
  hasHeader = true,
  hasFooter = true,
  className,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'w-full max-w-md rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80',
        'bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md p-6 shadow-xs dark:shadow-none',
        'flex flex-col gap-6',
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-center gap-4">
          <SkeletonAvatar size="md" />
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-4 w-1/2" rounded="md" />
            <Skeleton className="h-3 w-1/3" rounded="sm" />
          </div>
        </div>
      )}

      <SkeletonText lines={3} />

      {hasFooter && (
        <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <Skeleton className="h-3 w-20" rounded="sm" />
          <SkeletonButton size="sm" className="w-20" />
        </div>
      )}
    </div>
  );
}

export interface SkeletonMetricProps extends React.ComponentProps<'div'> {}

/**
 * Specialized SaaS dashboard metric card skeleton
 */
function SkeletonMetric({ className, ...props }: SkeletonMetricProps) {
  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80',
        'bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md p-5 shadow-xs dark:shadow-none',
        'flex flex-col gap-4',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" rounded="md" />
        <Skeleton className="h-5 w-12" rounded="full" />
      </div>
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-8 w-36" rounded="lg" />
        <Skeleton className="h-3 w-16" rounded="sm" />
      </div>
      <Skeleton className="h-10 w-full mt-1" rounded="lg" />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonButton, SkeletonCard, SkeletonMetric };

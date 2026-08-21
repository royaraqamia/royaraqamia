import * as React from 'react';

export interface AuthDividerProps {
  /**
   * Label content displayed inside the central pill badge.
   * @default "أو"
   */
  children?: React.ReactNode;
  /**
   * Optional custom classes for the container wrapper.
   */
  className?: string;
}

export function AuthDivider({ children = 'أو', className = '' }: AuthDividerProps = {}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={`relative my-6 flex w-full items-center justify-center gap-3 select-none sm:my-8 ${className}`.trim()}
    >
      {/* Left fading divider rule */}
      <div
        aria-hidden="true"
        className="h-px flex-1 bg-linear-to-r from-transparent via-border/60 to-border"
      />

      {/* Center floating glassmorphic badge */}
      <span
        dir="auto"
        className="inline-flex items-center justify-center rounded-full border border-border/80 bg-card/75 px-3.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 ease-out hover:scale-[1.02] hover:border-border hover:bg-card/90 hover:text-foreground active:scale-[0.98]"
      >
        {children}
      </span>

      {/* Right fading divider rule */}
      <div
        aria-hidden="true"
        className="h-px flex-1 bg-linear-to-l from-transparent via-border/60 to-border"
      />
    </div>
  );
}

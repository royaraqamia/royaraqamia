'use client';

interface HeroSectionProps {
  sectionClassName: string;
  sectionAriaLabel?: string;
  decor: React.ReactNode;
  containerClassName: string;
  gridClassName: string;
  children: React.ReactNode;
}

export function HeroSection({
  sectionClassName,
  sectionAriaLabel,
  decor,
  containerClassName,
  gridClassName,
  children,
}: HeroSectionProps) {
  return (
    <section
      {...(sectionAriaLabel ? { 'aria-label': sectionAriaLabel } : {})}
      className={sectionClassName}
    >
      {decor}

      <div className={containerClassName}>
        <div className={gridClassName}>{children}</div>
      </div>
    </section>
  );
}

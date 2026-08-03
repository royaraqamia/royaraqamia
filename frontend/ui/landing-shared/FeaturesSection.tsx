'use client';

import { SectionHeading } from './SectionHeading';

interface FeaturesSectionProps {
  sectionClassName: string;
  decor: React.ReactNode;
  containerClassName: string;
  heading: React.ComponentProps<typeof SectionHeading>;
  gridClassName: string;
  children: React.ReactNode;
}

export function FeaturesSection({
  sectionClassName,
  decor,
  containerClassName,
  heading,
  gridClassName,
  children,
}: FeaturesSectionProps) {
  return (
    <section id="features" dir="rtl" className={sectionClassName}>
      {decor}

      <div className={containerClassName}>
        <SectionHeading {...heading} />
        <div className={gridClassName}>{children}</div>
      </div>
    </section>
  );
}

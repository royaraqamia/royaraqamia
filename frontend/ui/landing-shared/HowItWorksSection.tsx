'use client';

import { SectionHeading } from './SectionHeading';

interface HowItWorksSectionProps {
  sectionClassName: string;
  decor: React.ReactNode;
  containerClassName: string;
  heading: React.ComponentProps<typeof SectionHeading>;
  headingAriaLabelledBy?: string;
  timelineClassName: string;
  connector: React.ReactNode;
  stepsClassName: string;
  children: React.ReactNode;
}

export function HowItWorksSection({
  sectionClassName,
  decor,
  containerClassName,
  heading,
  headingAriaLabelledBy,
  timelineClassName,
  connector,
  stepsClassName,
  children,
}: HowItWorksSectionProps) {
  return (
    <section
      id="how-it-works"
      {...(headingAriaLabelledBy ? { 'aria-labelledby': headingAriaLabelledBy } : {})}
      className={sectionClassName}
    >
      {decor}

      <div className={containerClassName}>
        <SectionHeading {...heading} />

        <div className={timelineClassName}>
          {connector}

          <ol className={stepsClassName}>{children}</ol>
        </div>
      </div>
    </section>
  );
}

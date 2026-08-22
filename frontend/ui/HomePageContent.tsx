'use client';

import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { Portfolio } from './portfolio/portfolio';
import { Testimonials } from './Testimonials';
import { WebDevService } from './WebDevService';
import { TrainingCourses } from './TrainingCourses';
import { Certificate } from './Certificate';
import { VerifySection } from './VerifySection';
import { ConsultationCards } from './ConsultationCards';
import { WhyUs } from './WhyUs';
import { FAQ } from './FAQ';
import { CTA } from './CTA';

export function HomePageContent() {
  return (
    <main id="main-content" className="overflow-x-hidden w-full max-w-full">
      <Hero />
      <MetricCards />
      <Services />

      <Portfolio />

      <Testimonials />

      <WebDevService />

      <section id="training">
        <TrainingCourses />
        <Certificate />
      </section>

      <VerifySection />

      <section id="consultations">
        <ConsultationCards />
      </section>

      <WhyUs />
      <FAQ />
      <CTA />
    </main>
  );
}

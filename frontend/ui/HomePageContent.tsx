'use client';

import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { CTA } from './CTA';
import { Testimonials } from './Testimonials';
import { TrainingCourses } from './TrainingCourses';
import { Certificate } from './Certificate';
import { ConsultationCards } from './ConsultationCards';
import { WebDevService } from './WebDevService';
import { Portfolio } from './Portfolio';
import { VerifySection } from './VerifySection';
import { WhyUs } from './WhyUs';
import { FAQ } from './FAQ';

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

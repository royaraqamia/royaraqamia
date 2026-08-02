'use client';

import { Suspense, lazy } from 'react';
import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { CTA } from './CTA';
import { CircleNotch } from '@phosphor-icons/react';

const Testimonials = lazy(() =>
  import('./Testimonials').then((m) => ({ default: m.Testimonials }))
);
const TrainingCourses = lazy(() =>
  import('./TrainingCourses').then((m) => ({ default: m.TrainingCourses }))
);
const Certificate = lazy(() => import('./Certificate').then((m) => ({ default: m.Certificate })));
const ConsultationCards = lazy(() =>
  import('./ConsultationCards').then((m) => ({ default: m.ConsultationCards }))
);
const WebDevService = lazy(() =>
  import('./WebDevService').then((m) => ({ default: m.WebDevService }))
);
const Portfolio = lazy(() => import('./Portfolio').then((m) => ({ default: m.Portfolio })));
const VerifySection = lazy(() =>
  import('./VerifySection').then((m) => ({ default: m.VerifySection }))
);
const WhyUs = lazy(() => import('./WhyUs').then((m) => ({ default: m.WhyUs })));
const FAQ = lazy(() => import('./FAQ').then((m) => ({ default: m.FAQ })));

const SectionSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <CircleNotch className="h-8 w-8 animate-spin text-purple-500" />
  </div>
);

export function HomePageContent() {
  return (
    <main id="main-content" className="overflow-x-hidden w-full max-w-full">
      <Hero />
      <MetricCards />
      <Services />

      <Suspense fallback={<SectionSpinner />}>
        <Portfolio />
      </Suspense>

      <Suspense fallback={<SectionSpinner />}>
        <Testimonials />
      </Suspense>

      <Suspense fallback={<SectionSpinner />}>
        <WebDevService />
      </Suspense>

      <section id="training">
        <Suspense fallback={<SectionSpinner />}>
          <TrainingCourses />
        </Suspense>
        <Suspense fallback={<SectionSpinner />}>
          <Certificate />
        </Suspense>
      </section>

      <Suspense fallback={<SectionSpinner />}>
        <VerifySection />
      </Suspense>

      <section id="consultations">
        <Suspense fallback={<SectionSpinner />}>
          <ConsultationCards />
        </Suspense>
      </section>

      <Suspense fallback={<SectionSpinner />}>
        <WhyUs />
      </Suspense>
      <Suspense fallback={<SectionSpinner />}>
        <FAQ />
      </Suspense>
      <CTA />
    </main>
  );
}

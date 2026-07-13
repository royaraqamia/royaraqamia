'use client';

import { Suspense, lazy } from 'react';
import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { CTA } from './CTA';
import { WhatsAppFloat } from './WhatsAppFloat';
import { GoUpButton } from './GoUpButton';
import { useUI } from '../context/UIContext';
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
const WhyUs = lazy(() => import('./WhyUs').then((m) => ({ default: m.WhyUs })));
const FAQ = lazy(() => import('./FAQ').then((m) => ({ default: m.FAQ })));

const SectionSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <CircleNotch className="h-8 w-8 animate-spin text-purple-500" />
  </div>
);

export function HomePageContent() {
  const { activeServicesTab } = useUI();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-slate-950">
          <CircleNotch className="h-10 w-10 animate-spin text-purple-500" />
        </div>
      }
    >
      <main id="main-content" className="overflow-x-hidden w-full max-w-full">
        <Hero />
        <MetricCards />
        <Services />

        {activeServicesTab === 'merchants' && (
          <Suspense fallback={<SectionSpinner />}>
            <Portfolio />
          </Suspense>
        )}

        {activeServicesTab === 'students' && (
          <Suspense fallback={<SectionSpinner />}>
            <Testimonials />
          </Suspense>
        )}

        {activeServicesTab === 'students' && (
          <section id="training">
            <Suspense fallback={<SectionSpinner />}>
              <TrainingCourses />
            </Suspense>
            <Suspense fallback={<SectionSpinner />}>
              <Certificate />
            </Suspense>
          </section>
        )}

        {activeServicesTab === 'students' && (
          <section id="consultations">
            <Suspense fallback={<SectionSpinner />}>
              <ConsultationCards />
            </Suspense>
          </section>
        )}

        {activeServicesTab === 'merchants' && (
          <Suspense fallback={<SectionSpinner />}>
            <WebDevService />
          </Suspense>
        )}

        <Suspense fallback={<SectionSpinner />}>
          <WhyUs />
        </Suspense>
        <Suspense fallback={<SectionSpinner />}>
          <FAQ />
        </Suspense>
        <CTA />
      </main>

      <WhatsAppFloat phone="963968478904" message="السَّلام عليكم ورحمة اللّٰه وبركاته." />
      <GoUpButton />
    </Suspense>
  );
}

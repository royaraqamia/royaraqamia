'use client'; // Add this because you use hooks and context

import { Suspense, lazy } from 'react';
import { SkipToContent } from '../components/SkipToContent';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { MetricCards } from '../components/MetricCards';
import { Services } from '../components/Services';
import { CTA } from '../components/CTA';
import { Footer } from '../components/Footer';
import { WhatsAppFloat } from '../components/WhatsAppFloat';
import { GoUpButton } from '../components/GoUpButton';
import { useUI } from '../context/UIContext';
import { CircleNotch } from '@phosphor-icons/react';

// Lazy load components (same as before)
const Testimonials = lazy(() =>
  import('../components/Testimonials').then((m) => ({ default: m.Testimonials }))
);
const TrainingCourses = lazy(() =>
  import('../components/TrainingCourses').then((m) => ({ default: m.TrainingCourses }))
);
const Certificate = lazy(() =>
  import('../components/Certificate').then((m) => ({ default: m.Certificate }))
);
const ConsultationCards = lazy(() =>
  import('../components/ConsultationCards').then((m) => ({ default: m.ConsultationCards }))
);
const WebDevService = lazy(() =>
  import('../components/WebDevService').then((m) => ({ default: m.WebDevService }))
);
const Portfolio = lazy(() =>
  import('../components/Portfolio').then((m) => ({ default: m.Portfolio }))
);
const WhyUs = lazy(() => import('../components/WhyUs').then((m) => ({ default: m.WhyUs })));
const FAQ = lazy(() => import('../components/FAQ').then((m) => ({ default: m.FAQ })));

const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-950">
    <CircleNotch className="h-10 w-10 animate-spin text-purple-500" />
  </div>
);

export default function HomePage() {
  const { activeServicesTab } = useUI();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden w-full max-w-full">
      <SkipToContent />

      <Navbar />

      <Suspense fallback={<PageLoader />}>
        <main id="main-content" className="overflow-x-hidden w-full max-w-full">
          <Hero />
          <MetricCards />
          <Services />

          {activeServicesTab === 'merchants' && (
            <Suspense fallback={<div className="section-spacing" />}>
              <Portfolio />
            </Suspense>
          )}

          {activeServicesTab === 'students' && (
            <Suspense fallback={<div className="section-spacing" />}>
              <Testimonials />
            </Suspense>
          )}

          {activeServicesTab === 'students' && (
            <section id="training">
              <Suspense fallback={<div className="section-spacing" />}>
                <TrainingCourses />
              </Suspense>
              <Suspense fallback={<div className="section-spacing" />}>
                <Certificate />
              </Suspense>
            </section>
          )}

          {activeServicesTab === 'students' && (
            <section id="consultations">
              <Suspense fallback={<div className="section-spacing" />}>
                <ConsultationCards />
              </Suspense>
            </section>
          )}

          {activeServicesTab === 'merchants' && (
            <Suspense fallback={<div className="section-spacing" />}>
              <WebDevService />
            </Suspense>
          )}

          <Suspense fallback={<div className="section-spacing" />}>
            <WhyUs />
          </Suspense>
          <Suspense fallback={<div className="section-spacing" />}>
            <FAQ />
          </Suspense>
          <CTA />
        </main>
      </Suspense>

      <WhatsAppFloat phone="963968478904" message="السَّلام عليكم ورحمة اللّٰه وبركاته." />
      <GoUpButton />
      <Footer />
    </div>
  );
}

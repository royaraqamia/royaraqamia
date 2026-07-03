import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { SkipToContent } from './components/SkipToContent';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MetricCards } from './components/MetricCards';
import { Services } from './components/Services';

// Lazy load heavy components for better performance
const Testimonials = lazy(() =>
  import('./components/Testimonials').then((m) => ({ default: m.Testimonials }))
);
const TrainingCourses = lazy(() =>
  import('./components/TrainingCourses').then((m) => ({ default: m.TrainingCourses }))
);
const Certificate = lazy(() =>
  import('./components/Certificate').then((m) => ({ default: m.Certificate }))
);
const ConsultationCards = lazy(() =>
  import('./components/ConsultationCards').then((m) => ({ default: m.ConsultationCards }))
);
/*const NetworkingSection = lazy(() =>
  import('./components/NetworkingSection').then((m) => ({ default: m.NetworkingSection }))
);*/
const WebDevService = lazy(() =>
  import('./components/WebDevService').then((m) => ({ default: m.WebDevService }))
);
/*const SmartPricing = lazy(() =>
  import('./components/SmartPricing').then((m) => ({ default: m.SmartPricing }))
);*/
/*const AutoReplySystem = lazy(() =>
  import('./components/AutoReplySystem').then((m) => ({ default: m.AutoReplySystem }))
);*/
/*const ExchangeManagement = lazy(() =>
  import('./components/ExchangeManagement').then((m) => ({ default: m.ExchangeManagement }))
);*/
const WhyUs = lazy(() => import('./components/WhyUs').then((m) => ({ default: m.WhyUs })));

const FAQ = lazy(() => import('./components/FAQ').then((m) => ({ default: m.FAQ })));
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';
import { WhatsAppFloat } from './components/WhatsAppFloat';
import { GoUpButton } from './components/GoUpButton';
import { SEO } from './components/SEO';
import { StructuredData } from './components/StructuredData';
import { UIProvider, useUI } from './context/UIContext';
import { CircleNotch } from '@phosphor-icons/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';

// Loading Component
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-950">
    <CircleNotch className="h-10 w-10 animate-spin text-purple-500" />
  </div>
);

function AppContent() {
  const { activeServicesTab } = useUI();

  return (
          <div className="min-h-screen bg-background text-foreground overflow-x-hidden w-full max-w-full">
            {/* تحسين الوصول */}
            <SkipToContent />
            <SpeedInsights />
            <Analytics />

            {/* SEO عام للموقع */}
            <SEO
              title="رؤية رقمية"
              description="نبني لك مواقع إلكترونيَّة وتطبيقات | + ندرِّبك على بنائها. ونزوِّدك بمنتجات رقميَّة من صنع أيدينا لإدارة أعمالك وزبائنك بدقَّة واحترافيَّة."
              keywords={[
                'رؤية رقمية',
                'تدريب إلكتروني',
                'دورات برمجة',
                'دورات تسويق رقمي',
                'دورات تصميم',
                'ذكاء اصطناعي',
                'استشارات تقنية',
                'تشبيك احترافي',
                'منصة تدريب عربية',
                'تعليم إلكتروني',
                'شهادات معتمدة',
                'برمجة تطبيقات',
                'تطوير ويب',
                'تسويق إلكتروني',
                'تصميم جرافيك',
                'تجربة مستخدم',
                'e-learning Arabic',
                'digital training',
                'tech courses Arabic',
                'online certification',
                'Roya Raqamia',
              ]}
              url="https://royaraqamia.com"
              canonical="https://royaraqamia.com/"
            />

            {/* WebSite Schema for SERP Site Name */}
            <StructuredData
              type="website"
              data={{
                name: 'رؤية رقمية',
                url: 'https://royaraqamia.com',
              }}
            />

            {/* Structured Data عام للمؤسسة */}
            <StructuredData
              type="organization"
              data={{
                name: 'رؤية رقمية',
                url: 'https://royaraqamia.com',
                logo: 'https://royaraqamia.com/logo.png',
                description:
                  'نبني لك مواقع إلكترونيَّة وتطبيقات | + ندرِّبك على بنائها. ونزوِّدك بمنتجات رقميَّة من صنع أيدينا لإدارة أعمالك وزبائنك بدقَّة واحترافيَّة.',
                email: 'contact@royaraqamia.com',
                telephone: '+963968478904',
                address: {
                  addressCountry: 'SY',
                  addressRegion: 'Aleppo',
                },
                sameAs: [
                  'https://twitter.com/royaraqamia',
                  'https://linkedin.com/company/royaraqamia',
                  'https://facebook.com/royaraqamia',
                  'https://instagram.com/royaraqamia',
                ],
              }}
            />

            {/* LocalBusiness Schema for better local SEO */}
            <StructuredData
              type="localBusiness"
              data={{
                name: 'رؤية رقمية',
                url: 'https://royaraqamia.com',
                logo: 'https://royaraqamia.com/logo.png',
                description: 'نبني لك مواقع إلكترونيَّة وتطبيقات | + ندرِّبك على بنائها. ونزوِّدك بمنتجات رقميَّة من صنع أيدينا لإدارة أعمالك وزبائنك بدقَّة واحترافيَّة.',
                email: 'contact@royaraqamia.com',
                telephone: '+963968478904',
                address: {
                  streetAddress: '',
                  addressLocality: 'Aleppo',
                  addressRegion: 'Aleppo',
                  addressCountry: 'SY',
                },
                geo: {
                  latitude: 36.2021,
                  longitude: 37.1343,
                },
                openingHours: ['Mo-Su 00:00-23:59'],
                priceRange: '$$',
              }}
            />

            <Navbar />

            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* الصفحة الرئيسية */}
                <Route
                  path="/"
                  element={
                    <main id="main" className="overflow-x-hidden w-full max-w-full">
                      <Hero />
                      <MetricCards />
                      <Services />
                      {activeServicesTab === 'students' && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <Testimonials />
                        </Suspense>
                      )}

                      {/* Training Section - shown for students tab */}
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

                      {/* Consultations Section - shown only for students */}
                      {activeServicesTab === 'students' && (
                        <section id="consultations">
                          <Suspense fallback={<div className="section-spacing" />}>
                            <ConsultationCards />
                          </Suspense>
                        </section>
                      )}
                      
                      {/* Web Development - shown for merchants */}
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
                  }
                />

              </Routes>
            </Suspense>
            <WhatsAppFloat phone="963968478904" message="السَّلام عليكم ورحمة اللّٰه وبركاته." />
            <GoUpButton />
            <Footer />
            <Toaster position="top-center" richColors />
          </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <UIProvider>
          <AppContent />
        </UIProvider>
      </Router>
    </ErrorBoundary>
  );
}

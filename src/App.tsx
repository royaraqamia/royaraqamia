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
const NetworkingSection = lazy(() =>
  import('./components/NetworkingSection').then((m) => ({ default: m.NetworkingSection }))
);
// Almudeer hidden temporarily: const AlMudirApp = lazy(() => import('./components/AlMudirApp').then(m => ({ default: m.AlMudirApp })));
const WebDevService = lazy(() =>
  import('./components/WebDevService').then((m) => ({ default: m.WebDevService }))
);
const PaymentService = lazy(() =>
  import('./components/PaymentService').then((m) => ({ default: m.PaymentService }))
);
const SmartPricing = lazy(() =>
  import('./components/SmartPricing').then((m) => ({ default: m.SmartPricing }))
);
const AutoReplySystem = lazy(() =>
  import('./components/AutoReplySystem').then((m) => ({ default: m.AutoReplySystem }))
);
const ExchangeManagement = lazy(() =>
  import('./components/ExchangeManagement').then((m) => ({ default: m.ExchangeManagement }))
);
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
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { NotificationAdmin } from './components/NotificationAdmin';

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

            {/* SEO عام للموقع */}
            <SEO
              title="رؤية رقمية | المنصة العربية الأولى للتدريب الرقمي والاستشارات التقنية"
              description="انضم إلى المنصة العربية الرائدة في التدريب التقني والاستشارات الرقمية. دورات برمجة، تسويق رقمي، تصميم، وذكاء اصطناعي مع شهادات معتمدة. ابدأ رحلتك الاحترافية اليوم."
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
                  'المنصة العربية الرائدة في التدريب التقني والاستشارات الرقمية. نقدم دورات شاملة في البرمجة، التسويق الرقمي، التصميم، والذكاء الاصطناعي مع شهادات معتمدة. نربط المتعلمين بخبراء عرب ومستشارين تقنيين لبناء مستقبل رقمي ناجح.',
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
                description: 'المنصة العربية الرائدة في التدريب التقني والاستشارات الرقمية',
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

            {/* Service Schema: Training */}
            <StructuredData
              type="service"
              data={{
                name: 'التدريب الإلكتروني المتقدم في البرمجة والتقنية',
                description:
                  'دورات تدريبية احترافية أونلاين في البرمجة، التسويق الرقمي، التصميم، والذكاء الاصطناعي. مسارات تعليمية واضحة من الصفر حتى الاحتراف مع شهادات معتمدة ومشاريع عملية.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Education & Training',
                offers: {
                  price: '36',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Service Schema: Consultations */}
            <StructuredData
              type="service"
              data={{
                name: 'الاستشارات التعليمية والتقنية المتخصصة',
                description:
                  'جلسات استشارية فردية وجماعية عبر الإنترنت لتحليل الاحتياجات التقنية وتقديم حلول عملية مخصصة للشركات والأفراد في المجالات الرقمية.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Professional Services',
              }}
            />

            {/* Service Schema: Networking */}
            <StructuredData
              type="service"
              data={{
                name: 'مجتمع التشبيك الاحترافي للخبراء العرب',
                description:
                  'منصة تشبيك متقدمة تربط المتخصصين العرب بأصحاب العمل والفرص المهنية. نظام مطابقة ذكي لبناء شراكات استراتيجية ناجحة في جميع أنحاء العالم العربي.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Professional Networking',
              }}
            />

            {/* Service Schema: Al-Modir App */}
            <StructuredData
              type="service"
              data={{
                name: 'تطبيق "المدير" الشامل - تطبيق إدارة متكامل',
                description:
                  'تطبيق شامل يجمع المحادثات، المهام، الملاحظات، الملفات، جهات الاتصال، قرآن، أذكار، مسبحة، متصفح، QR، حاسبة، ومشاركة مباشرة في مكان واحد. اشتراك شهري أو سنوي.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Software Application',
                offers: {
                  price: '10',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Service Schema: Direct E-Payment Service */}
            <StructuredData
              type="service"
              data={{
                name: 'خدمة الدَّفع الإلكتروني المُباشر',
                description:
                  'تنفيذ عمليات الدَّفع أونلاين نيابةً عن الزبون لتسهيل المشتريات والاشتراكات الرقمية. رسوم خدمة ثابتة وشفافة.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Financial Services',
                offers: {
                  price: '10',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Service Schema: Smart Pricing System */}
            <StructuredData
              type="service"
              data={{
                name: 'نظام التَّسعير الذَّكي عبر Google Sheets',
                description:
                  'نظام إلكتروني مبرمج يتيح تحديث الأسعار وحساب التكاليف والأرباح تلقائيًا عند تعديل سعر الصرف. دفعة واحدة - استخدام دائم.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Business Tools',
                offers: {
                  price: '25',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Service Schema: Professional Reply System */}
            <StructuredData
              type="service"
              data={{
                name: 'نظام الرَّد الاحترافي التلقائي',
                description:
                  'نظام يستلم ويرد على رسائل الزبون عبر منصات التواصل الاجتماعي بشكل احترافي وبلغة طبيعية دون توقف 24/7.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Automation & AI',
                offers: {
                  price: '25',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Service Schema: Exchange Management System */}
            <StructuredData
              type="service"
              data={{
                name: 'نظام إدارة الصَّرافة والحوَّالات',
                description:
                  'نظام متكامل عبر Google Sheets لإدارة عمليَّات الصَّرافة والحوالات الماليَّة، يُتيح تتبُّع المعاملات، حساب الأرباح، وإدارة الزَّبائن بسهولة.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                category: 'Business Tools',
                offers: {
                  price: '100',
                  priceCurrency: 'USD',
                },
              }}
            />

            {/* Course Schema: Digital Marketing */}
            <StructuredData
              type="course"
              data={{
                name: 'دورة التسويق الرقمي وكتابة المحتوى الاحترافي',
                description:
                  'تعلم أساسيات التسويق الرقمي، إدارة منصات التواصل الاجتماعي، كتابة المحتوى الإبداعي، تحسين محركات البحث SEO، والإعلانات الممولة. دورة شاملة تؤهلك لسوق العمل.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                educationalCredential: 'شهادة إتمام معتمدة',
                courseMode: 'Online',
                inLanguage: 'Arabic',
              }}
            />

            {/* Course Schema: Programming */}
            <StructuredData
              type="course"
              data={{
                name: 'دورة البرمجة والتطوير التقني الشاملة',
                description:
                  'مسار تعليمي متكامل لتعلم البرمجة من الصفر حتى الاحتراف. يشمل تطوير الويب (Frontend & Backend)، تطوير التطبيقات، قواعد البيانات، والنشر على السيرفرات.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                educationalCredential: 'شهادة إتمام معتمدة',
                courseMode: 'Online',
                inLanguage: 'Arabic',
              }}
            />

            {/* Course Schema: Design */}
            <StructuredData
              type="course"
              data={{
                name: 'دورة التصميم الجرافيكي وتجربة المستخدم UI/UX',
                description:
                  'إتقان أدوات التصميم الجرافيكي الحديثة (Figma، Adobe)، مبادئ تصميم الواجهات، تجربة المستخدم UI/UX، وإنشاء تصاميم عصرية احترافية.',
                provider: 'رؤية رقمية',
                areaServed: 'العالم العربي',
                educationalCredential: 'شهادة إتمام معتمدة',
                courseMode: 'Online',
                inLanguage: 'Arabic',
              }}
            />

            {/* Course Schema: AI & Zero-Code */}
            <StructuredData
              type="course"
              data={{
                name: 'دورة بناء منتجات رقمية بالذكاء الاصطناعي (Zero-Code)',
                description:
                  'تعلم بناء مواقع وتطبيقات كاملة باستخدام أدوات الذكاء الاصطناعي مثل Antigravity و Gemini دون كتابة كود. يشمل المشروع النهائي وخطة إطلاق المنتج.',
                provider: 'رؤية رقمية - م. أيهم العلي',
                areaServed: 'العالم العربي',
                educationalCredential: 'شهادة إتمام معتمدة',
                courseMode: 'Online',
                inLanguage: 'Arabic',
                offers: {
                  price: '36',
                  priceCurrency: 'USD',
                },
                totalHistory: '12 ساعة',
                coursePrerequisites: 'لا يحتاج خبرة مسبقة',
              }}
            />

            {/* EducationalOccupationalProgram Schema */}
            <StructuredData
              type="EducationalOccupationalProgram"
              data={{
                name: 'البرنامج المتكامل للتدريب الرقمي',
                description:
                  'برنامج تعليمي شامل يجمع بين البرمجة، التصميم، التسويق الرقمي، والذكاء الاصطناعي في مسار واحد متكامل.',
                provider: 'رؤية رقمية',
                educationalCredential: 'شهادة إتمام البرنامج المتكامل',
                courseMode: 'Online',
                inLanguage: 'Arabic',
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
                      <Suspense fallback={<div className="section-spacing" />}>
                        <Testimonials />
                      </Suspense>

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

                      {/* Consultations Section - shown for merchants and students */}
                      {(activeServicesTab === 'merchants' || activeServicesTab === 'students') && (
                        <section id="consultations">
                          <Suspense fallback={<div className="section-spacing" />}>
                            <ConsultationCards />
                          </Suspense>
                        </section>
                      )}

                      {/* التشبيك - shown for merchants and students */}
                      {(activeServicesTab === 'merchants' || activeServicesTab === 'students') && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <NetworkingSection />
                        </Suspense>
                      )}

                      {/* Payment Service - shown for merchants */}
                      {activeServicesTab === 'merchants' && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <PaymentService />
                        </Suspense>
                      )}

                      {/* Smart Pricing - shown for merchants */}
                      {activeServicesTab === 'merchants' && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <SmartPricing />
                        </Suspense>
                      )}

                      {/* Exchange Management - shown for exchange tab */}
                      {activeServicesTab === 'exchange' && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <ExchangeManagement />
                        </Suspense>
                      )}

                      {/* Auto Reply - shown for merchants */}
                      {activeServicesTab === 'merchants' && (
                        <Suspense fallback={<div className="section-spacing" />}>
                          <AutoReplySystem />
                        </Suspense>
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
                {/* Admin Dashboard */}
                <Route path="/admin/notifications" element={<NotificationAdmin />} />
              </Routes>
            </Suspense>
            <WhatsAppFloat phone="963968478904" message="السَّلام عليكم ورحمة اللّٰه وبركاته." />
            <GoUpButton />
            <PWAInstallPrompt />
            <PWAUpdatePrompt />
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

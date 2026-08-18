import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { LazySection } from './shared/LazySection';

export function HomePageContent() {
  return (
    <main id="main-content" className="overflow-x-hidden w-full max-w-full">
      <Hero />
      <MetricCards />
      <Services />

      <LazySection id="portfolio" />

      <LazySection id="testimonials" />

      <LazySection id="web-dev-service" />

      <section id="training">
        <LazySection id="training-courses" />
        <LazySection id="certificate" />
      </section>

      <LazySection id="verify" />

      <section id="consultations">
        <LazySection id="consultations-cards" />
      </section>

      <LazySection id="why-us" />
      <LazySection id="faq" />
      <LazySection id="cta" />
    </main>
  );
}

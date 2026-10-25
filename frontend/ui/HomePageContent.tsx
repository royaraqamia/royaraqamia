import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { Testimonials } from './Testimonials';

export function HomePageContent() {
  return (
    <main id="main-content" className="overflow-x-hidden w-full max-w-full">
      <Hero />
      <MetricCards />
      <Services />

      <Testimonials />

      {/* <WhyUs /> */}
      {/* <CTA /> */}
    </main>
  );
}

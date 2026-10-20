import { Hero } from './Hero';
import { MetricCards } from './MetricCards';
import { Services } from './Services';
import { Portfolio } from './portfolio/portfolio';
import { Testimonials } from './Testimonials';
import { WebDevService } from './WebDevService';
import { TrainingCourses } from './TrainingCourses';
import { Certificate } from './Certificate';
import { ConsultationCards } from './ConsultationCards';

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

      <section id="consultations">
        <ConsultationCards />
      </section>

      {/* <WhyUs /> */}
      {/* <CTA /> */}
    </main>
  );
}

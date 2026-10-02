import { ScrollAnimation } from './ScrollAnimations';
import { TestimonialsCarousel } from './TestimonialsCarousel';
import { SectionTitle, SectionTitleHighlight } from './shared/section-title';

export function Testimonials() {
  return (
    <section className="relative py-16 sm:py-24 lg:py-32 overflow-hidden" id="testimonials">
      {/* Section Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 sm:mb-10 lg:mb-12">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
            <SectionTitle id="testimonials-heading">
              ماذا <SectionTitleHighlight>قالوا عنَّا</SectionTitleHighlight>؟
            </SectionTitle>
          </div>
        </ScrollAnimation>
      </div>

      {/* Interactive carousel island */}
      <TestimonialsCarousel />
    </section>
  );
}

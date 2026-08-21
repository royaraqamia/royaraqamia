import { ScrollAnimation } from './ScrollAnimations';
import { TestimonialsCarousel } from './TestimonialsCarousel';

export function Testimonials() {
  return (
    <section className="relative py-16 sm:py-24 lg:py-32 overflow-hidden" id="testimonials">
      {/* Background Subtle Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
        <div className="h-87.5 w-125 sm:h-112.5 sm:w-175 rounded-full bg-violet-600/10 glow-blur-lg transform-gpu" />
      </div>

      {/* Section Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 sm:mb-14">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
            <h2
              id="testimonials-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight"
            >
              ماذا{' '}
              <span className="bg-linear-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                قالوا عنَّا
              </span>
              ؟
            </h2>
            <p className="mt-3 text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl leading-relaxed">
              تجارب حقيقيَّة ورؤى صادقة من زبائننا حول ما نُقدِّم
            </p>
          </div>
        </ScrollAnimation>
      </div>

      {/* Interactive carousel island */}
      <TestimonialsCarousel />
    </section>
  );
}

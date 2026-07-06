'use client';

import { Microphone } from '@phosphor-icons/react';
import { Button } from './ui/button';
import { ScrollAnimation } from './ScrollAnimations';

export function ConsultationCards() {
  return (
    <section
      id="consultation"
      dir="rtl"
      className="relative overflow-hidden py-20 md:py-28"
      style={{ backgroundColor: '#0a0a0a' }}
      aria-label="الاستشارة التقنية الشاملة"
    >
      {/* Ambient Glow Effects */}
      <div
        className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full pointer-events-none blur-[120px]"
        style={{
          background: 'radial-gradient(circle, rgba(244, 63, 94, 0.15) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full pointer-events-none blur-[100px]"
        style={{
          background: 'radial-gradient(circle, rgba(251, 113, 133, 0.1) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full pointer-events-none blur-[150px]"
        style={{
          background: 'radial-gradient(ellipse, rgba(225, 29, 72, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center mb-12 md:mb-16">
            {/* H1 Title */}
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-rose-400">الاستشارات</span>
            </h2>

            {/* Subtitle */}
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9] max-w-3xl mx-auto">
              نختصر عليك سنوات من البحث ونمنحك الخلاصة التِّقنيَّة والعمليَّة بصدق وأمانة.
            </p>
          </div>
        </ScrollAnimation>

        {/* Main Pricing Card */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="relative">
            {/* Glassmorphism Card */}
            <div
              className="relative rounded-3xl overflow-hidden shadow-[0_0_60px_-10px_rgba(244,63,94,0.4)]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(88, 28, 87, 0.4) 0%, rgba(59, 7, 59, 0.5) 50%, rgba(30, 27, 75, 0.6) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                boxShadow:
                  '0 25px 50px -12px rgba(244, 63, 94, 0.25), 0 0 100px -20px rgba(251, 113, 133, 0.35), 0 0 40px -10px rgba(244, 63, 94, 0.3)',
              }}
            >
              {/* Card Header */}
              <div className="p-6 md:p-8 lg:p-10">
                {/* Top Row: Price and Badge */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  {/* Price - Top Left (appears on right in RTL) */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-bold text-rose-400">$25</span>
                    <span className="text-gray-400 text-lg">/ للسَّاعة</span>
                  </div>

                  {/* Badge - Top Right (appears on left in RTL) */}
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full self-start"
                    style={{
                      background: 'rgba(244, 63, 94, 0.15)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                    }}
                  >
                    <Microphone className="w-4 h-4 text-rose-400" />
                    <span
                      className="text-sm text-rose-300 font-medium"
                      style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                    >
                      جلسة تفاعليَّة صوتيَّة
                    </span>
                  </div>
                </div>

                {/* Title and Description */}
                <div className="mb-8">
                  <h3
                    className="text-2xl md:text-3xl font-bold text-white mb-4"
                    style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                  >
                    توجيه تقني متكامل
                  </h3>
                  <p
                    className="text-slate-300 font-medium text-base md:text-lg leading-relaxed max-w-2xl"
                    style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", lineHeight: '1.8' }}
                  >
                    تحليل كامل لاحتياجاتك الرَّقميَّة. نُراجع ما لديك، ونرسم لك مسار التَّعليم أو
                    التَّنفيذ خطوة بخطوة. استشارة تمنحك الوضوح التَّام.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-4">
                  {/* Primary CTA Button */}
                  <a
                    href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في حجز استشارة."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    aria-label="احجز استشارتك الآن"
                  >
                    <Button
                      className="w-full h-14 md:h-16 text-lg md:text-xl font-bold text-white rounded-full transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl shadow-lg shadow-rose-600/40"
                      style={{
                        background:
                          'linear-gradient(135deg, #F43F5E 0%, #E11D48 50%, #FB7185 100%)',
                        boxShadow:
                          '0 10px 40px -10px rgba(244, 63, 94, 0.5), 0 0 60px -15px rgba(251, 113, 133, 0.3)',
                      }}
                    >
                      <span style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
                        احجز استشارتك الآن
                      </span>
                    </Button>
                  </a>
                </div>
              </div>
            </div>

            {/* Decorative Elements Behind Card */}
            <div
              className="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-2xl pointer-events-none -z-10"
              style={{ background: 'rgba(244, 63, 94, 0.3)' }}
            />
            <div
              className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full blur-2xl pointer-events-none -z-10"
              style={{ background: 'rgba(251, 113, 133, 0.2)' }}
            />
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

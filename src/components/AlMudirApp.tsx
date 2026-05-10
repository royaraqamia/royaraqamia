import { Button } from './ui/button';
import {
  ChatCircle,
  CalendarCheck,
  Users,
  BookBookmark,
  Sparkle,
  Browser,
  QrCode,
  Star,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function AlMudirApp() {
  const features = [
    { icon: ChatCircle, text: 'محادثات فوريَّة' },
    { icon: CalendarCheck, text: 'إدارة المهام والمشاريع' },
    { icon: Users, text: 'جهات الاتِّصال' },
    { icon: BookBookmark, text: 'قُرآن كريم وأذكار يوميَّة' },
    { icon: Browser, text: 'متصفِّح ويب' },
    { icon: QrCode, text: 'ماسح QR وحاسبة ذكيَّة' },
    { icon: Sparkle, text: 'مشاركة مُباشرة' },
    { icon: Star, text: 'مسبحة إلكترونيَّة وملاحظات' },
  ];

  return (
    <section id="almudar-app" className="section-spacing relative overflow-hidden">
      {/* Background with Blue Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-blue-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-indigo-500/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
              <Sparkle className="w-4 h-4 text-blue-400" weight="duotone" />
              <span className="text-sm font-medium text-blue-400">تطبيق واحد لكلِّ شيء</span>
            </div>
            <h2
              className="text-h2 mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              تطبيق{' '}
              <span className="text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                المدير
              </span>{' '}
              الشَّامل
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              تطبيق متكامل يجمع المحادثات، المهام، الملاحظات، الملفَّات، جهات الاتِّصال، قُرآن،
              أذكار، مسبحة، متصفِّح، QR، حاسبة — كل ذلك وأكثر في مكانٍ واحد.
            </p>
          </div>
        </ScrollAnimation>

        {/* Features Grid */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="group p-4 md:p-6 rounded-2xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all duration-300 text-center"
              >
                <div className="w-12 h-12 md:w-14 md:h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-110 group-hover:shadow-blue-500/40 transition-all duration-300">
                  <feature.icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                  {feature.text}
                </span>
              </div>
            ))}
          </div>
        </ScrollAnimation>

        {/* Pricing & CTA Card */}
        <ScrollAnimation animation="scale" duration={0.7} delay={0.3}>
          <div className="max-w-2xl mx-auto">
            <div className="relative p-[1px] rounded-3xl overflow-hidden group">
              {/* Animated Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/30 to-indigo-500/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-[spin_3s_linear_infinite]" />
              <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-3xl z-0" />

              <div className="relative z-10 p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl">
                <div className="text-center mb-6">
                  <h3
                    className="text-2xl md:text-3xl font-bold text-white mb-2"
                    style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                  >
                    خطط الأسعار
                  </h3>
                  <p className="text-slate-400 text-sm">اختر الخطَّة التي تناسب احتياجاتك</p>
                </div>

                {/* Pricing Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* Monthly */}
                  <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center hover:border-blue-500/40 transition-all duration-300">
                    <div className="text-sm text-slate-400 mb-2">شهري</div>
                    <div className="text-4xl font-bold text-blue-400 mb-1">$10</div>
                    <div className="text-xs text-slate-500">/شهر</div>
                  </div>
                  {/* Yearly */}
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border-2 border-blue-500/40 text-center relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold">
                      وفِّر 17%
                    </div>
                    <div className="text-sm text-slate-400 mb-2">سنوي</div>
                    <div className="text-4xl font-bold text-blue-400 mb-1">$90</div>
                    <div className="text-xs text-slate-500">/سنة</div>
                  </div>
                </div>

                {/* CTA Button */}
                <a
                  href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في الاشتراك في تطبيق المدير."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300">
                    <ChatCircle className="w-5 h-5 ml-2" weight="fill" />
                    اشترك الآن عبر واتساب
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

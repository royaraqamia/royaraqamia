import { Button } from './ui/button';
import {
  Code,
  Rocket,
  ShieldCheck,
  DeviceMobile,
  Monitor,
  Globe,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function WebDevService() {
  const benefits = [
    { icon: Code, text: 'أفضل ممارسات البرمجة بكود نظيف وقابل للصِّيانة' },
    { icon: Rocket, text: 'نشر سريع مع أداء مُحسَّن' },
    { icon: ShieldCheck, text: 'تطوير آمن مع معايير أمان حديثة' },
    { icon: DeviceMobile, text: 'تصميم متجاوب لجميع الأجهزة وأحجام الشَّاشات' },
  ];

  const features = [
    { title: 'Frontend', description: 'Next.js مع واجهات UX/UI حديثة' },
    { title: 'Backend', description: 'Supabase' },
    { title: 'Mobile Apps', description: 'Flutter لنظامي Android و iOS' },
    { title: 'Database', description: 'PostgreSQL' },
  ];

  return (
    <section id="web-dev-service" className="section-spacing relative overflow-hidden">
      {/* Background with Blue Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-blue-500/10 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-blue-600/10 rounded-full blur-[100px] translate-y-1/3 translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-blue-400">
                بناء مواقع إلكترونيَّة وتطبيقات
              </span>{' '}
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              خدمات تطوير متكاملة للمواقع والتَّطبيقات من الفكرة حتَّى الإطلاق. نبني حلول رقميَّة
              قابلة للتَّوسُّع، آمنة، وسهلة الاستخدام.
            </p>
          </div>
        </ScrollAnimation>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Benefits & Features */}
          <ScrollAnimation animation="slide-right" duration={0.7}>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3
                  className="text-2xl md:text-3xl font-bold text-white"
                  style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                >
                  لماذا تختار خدمات التَّطوير لدينا؟
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  نقدِّم حلول تطوير متكاملة من البداية إلى النِّهاية باستخدام تقنيات حديثة، لضمان أن
                  يكون منتجك الرَّقمي قابلًا للتَّوسُّع والأداء العالي.
                </p>
              </div>

              {/* Benefits List */}
              <div className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                      <benefit.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="flex flex-col justify-center items-center h-[5vh] text-sm md:text-base text-slate-200 group-hover:text-white transition-colors">
                      {benefit.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Features Grid */}
              <div className="space-y-4">
                <h4
                  className="text-xl font-bold text-white"
                  style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                >
                  خبراتنا
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/30 transition-all duration-300"
                    >
                      <h5 className="text-lg font-semibold text-blue-400 mb-2">
                        {feature.title}
                      </h5>
                      <p className="text-sm text-slate-300">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollAnimation>

          {/* Right: Pricing & Process */}
          <ScrollAnimation animation="slide-left" duration={0.7} delay={0.2}>
            <div className="space-y-6">

              {/* Basic Website */}
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        موقع بسيط
                      </h4>
                      <p className="text-xs text-slate-400">Landing Page & Website</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$500</div>
                    <div className="text-xs text-slate-500">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* Web Application */}
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <Globe className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        تطبيق ويب
                      </h4>
                      <p className="text-xs text-slate-400">Full-Stack Web App</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$1,500</div>
                    <div className="text-xs text-slate-500">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* Mobile Application */}
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <DeviceMobile className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        تطبيق موبايل
                      </h4>
                      <p className="text-xs text-slate-400">Mobile App for Android & iOS</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$2,500</div>
                    <div className="text-xs text-slate-500">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <a
                href="https://wa.me/963968478904?text=السَّلام عليكم، أنا مهتم بخدمة تطوير المواقع والتَّطبيقات."
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300">
                  <Code className="w-5 h-5 ml-2" />
                  ابدأ البناء الآن
                </Button>
              </a>
            </div>
          </ScrollAnimation>
        </div>
      </div>
    </section>
  );
}

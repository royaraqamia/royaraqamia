'use client';

import { Button } from './ui/button';
import { Code, Rocket, ShieldCheck, DeviceMobile, Monitor, Globe } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';
import { WHATSAPP_PHONE } from '../lib/constants';
import { SectionBackground } from './SectionBackground';

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
      <div className="absolute inset-0 bg-background z-0">
        <SectionBackground
          blobs={[
            {
              top: '0',
              left: '0',
              width: '400px',
              height: '400px',
              background: 'rgba(59, 130, 246, 0.1)',
              filter: 'blur(100px)',
              transform: 'translate(-25%, -50%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '400px',
              height: '400px',
              background: 'rgba(37, 99, 235, 0.1)',
              filter: 'blur(100px)',
              transform: 'translate(25%, 33%)',
              animation: 'pulse-slow 4s ease-in-out infinite',
              animationDelay: '1s',
            },
          ]}
        />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-blue-400">بناء مواقع إلكترونيَّة وتطبيقات</span>{' '}
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
              {/* Benefits List */}
              <div className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                      <benefit.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="flex flex-col justify-center items-center py-2 text-sm md:text-base text-foreground/80 group-hover:text-foreground transition-colors">
                      {benefit.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Features Grid */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/30 transition-all duration-300"
                    >
                      <h3 className="text-lg font-semibold text-blue-400 mb-2">{feature.title}</h3>
                      <p className="text-sm text-foreground/70">{feature.description}</p>
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
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        موقع بسيط
                      </h3>
                      <p className="text-xs text-muted-foreground">Landing Page & Website</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$500</div>
                    <div className="text-xs text-muted-foreground">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* Web Application */}
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <Globe className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        تطبيق ويب
                      </h3>
                      <p className="text-xs text-muted-foreground">Full-Stack Web App</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$1,000</div>
                    <div className="text-xs text-muted-foreground">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* Mobile Application */}
              <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
                      <DeviceMobile className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        تطبيق موبايل
                      </h3>
                      <p className="text-xs text-muted-foreground">Mobile App for Android & iOS</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-400">$2,000</div>
                    <div className="text-xs text-muted-foreground">بدءًا من</div>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <a
                href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent('السَّلام عليكم، أنا مهتم بخدمة تطوير المواقع والتَّطبيقات.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full h-14 text-base font-bold rounded-xl bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-11">
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

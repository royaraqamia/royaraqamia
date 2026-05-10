import { Button } from './ui/button';
import {
  Robot,
  Check,
  ChatCircle,
  Clock,
  GlobeSimple,
  InstagramLogo,
  FacebookLogo,
  TwitterLogo,
  WhatsappLogo,
  LinkedinLogo,
  TelegramLogo,
  Chats,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function AutoReplySystem() {
  const platforms = [
    { icon: InstagramLogo, name: 'Instagram' },
    { icon: FacebookLogo, name: 'Facebook' },
    { icon: TwitterLogo, name: 'X (Twitter)' },
    { icon: WhatsappLogo, name: 'WhatsApp' },
    { icon: LinkedinLogo, name: 'LinkedIn' },
    { icon: TelegramLogo, name: 'Telegram' },
    { icon: Chats, name: 'Messenger' },
  ];

  const features = [
    {
      icon: Robot,
      title: 'ردود ذكيَّة',
      description: 'نظام يردُّ على رسائلك بلغة طبيعيَّة واحترافيَّة.',
    },
    {
      icon: Clock,
      title: 'عمل متواصل',
      description: 'لا يفوتك أي رسالة — ردود فوريَّة على مدار السَّاعة.',
    },
    {
      icon: GlobeSimple,
      title: 'دعم متعدِّد المنصَّات',
      description: 'يعمل على مختلف منصَّات التَّواصل الاجتماعي في مكانٍ واحد.',
    },
    {
      icon: ChatCircle,
      title: 'لغة طبيعيَّة سلسة',
      description: 'ردود بشريَّة الطَّابع بدون أن يلاحظ الزَّبون أنَّها آليَّة.',
    },
  ];

  return (
    <section id="auto-reply" className="section-spacing relative overflow-hidden">
      {/* Background with Purple Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-purple-500/10 rounded-full blur-[80px] md:blur-[100px] -translate-y-1/2 -translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-purple-600/10 rounded-full blur-[80px] md:blur-[100px] translate-y-1/3 translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-purple-400">
                نظام الرَّد
              </span>
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-[1.8] sm:leading-[1.9]" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
              نرد على جميع رسائلك عبر منصَّات المراسلة والتَّواصل الاجتماعي بشكل احترافي وبلغة طبيعيَّة.
            </p>
          </div>
        </ScrollAnimation>

        {/* Platforms Row */}
        <ScrollAnimation animation="slide-up" duration={0.6} delay={0.1}>
          <div className="flex flex-wrap justify-center gap-4 mb-8 sm:mb-12">
            {platforms.map((platform, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-500/10 hover:scale-105 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F19] transition-all duration-300 group"
              >
                <platform.icon
                  className="w-5 h-5 text-purple-300 group-hover:text-white transition-colors"
                  weight="fill"
                  aria-label={`${platform.name} icon`}
                />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  {platform.name}
                </span>
              </div>
            ))}
          </div>
        </ScrollAnimation>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Pricing & CTA Card - First on mobile for conversion */}
          <ScrollAnimation animation="slide-left" duration={0.7} delay={0.2} className="lg:order-2">
            <div className="relative p-[1px] rounded-3xl overflow-hidden group">
              {/* Static Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 via-purple-600/30 to-purple-500/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-3xl z-0" />

              <div className="relative z-10 p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl">
                {/* Price Display */}
                <div className="text-center mb-6">
                  <div className="text-6xl font-bold text-white mb-2">$25</div>
                  <p className="text-slate-300 text-sm">اشتراك شهري</p>
                </div>

                {/* What You Get */}
                <div className="space-y-4 mb-6">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    ما ستحصل عليه:
                  </h4>
                  {[
                    'ردود احترافيَّة على كل منصَّاتك',
                    'لغة طبيعيَّة دون توقُّف',
                    'إعداد وتخصيص كامل للنِّظام',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-purple-300" weight="fill" />
                      </div>
                      <span className="text-sm text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <a
                  href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في تفعيل نظام الرَّد الاحترافي."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 hover:-translate-y-0.5 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300">
                    <Robot className="w-5 h-5 ml-2" weight="fill" />
                    فعِّل النِّظام الآن
                  </Button>
                </a>
              </div>
            </div>
          </ScrollAnimation>

          {/* Features */}
          <ScrollAnimation animation="slide-right" duration={0.7} className="lg:order-1">
            <div className="space-y-5">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 p-6 rounded-2xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-500/10 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F19] transition-all duration-300 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-purple-500/30 transition-all duration-300">
                    <feature.icon className="w-6 h-6 text-white" weight="fill" />
                  </div>
                  <div>
                    <h4
                      className="text-lg font-bold text-white mb-1"
                      style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                    >
                      {feature.title}
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollAnimation>
        </div>
      </div>
    </section>
  );
}

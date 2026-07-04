import { Button } from './ui/button';
import {
  Robot,
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
      description: 'لا يفوتك أي رسالة — ردود شبه فوريَّة على مدار اليوم.',
    },
    {
      icon: GlobeSimple,
      title: 'دعم متعدِّد المنصَّات',
      description: 'يعمل على مختلف منصَّات المراسلة والتَّواصل الاجتماعي.',
    },
    {
      icon: ChatCircle,
      title: 'لغة طبيعيَّة سلسة',
      description: 'ردود بشريَّة 100%.',
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
              نردُّ على رسائل زبائنك عبر منصَّات المراسلة والتَّواصل الاجتماعي بشكل احترافي وبلغة طبيعيَّة.
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

          {/* Pricing Cards - Three Subscription Options */}
          <ScrollAnimation animation="slide-left" duration={0.7} delay={0.2} className="lg:order-2">
            <div className="space-y-4">
              {[
                {
                  price: '$25',
                  messages: '250',
                },
                {
                  price: '$50',
                  messages: '500',
                },
                {
                  price: '$100',
                  messages: '1,000',
                },
              ].map((plan, idx) => (
                <div
                  key={idx}
                  className="relative p-[1px] rounded-2xl overflow-hidden group transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-purple-600/20 to-purple-500/20 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-2xl z-0" />

                  <div className="relative z-10 p-5 rounded-2xl bg-white/5 backdrop-blur-xl flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-bold text-purple-400">{plan.price}</div>
                        <div className="text-sm text-slate-400">/ شهر</div>
                      </div>
                      <p className="text-slate-300 text-sm mt-1">
                        {plan.messages} رسالة شهريًّا
                      </p>
                    </div>

                    <a
                      href={`https://wa.me/963968478904?text=السَّلام عليكم، أرغب في تفعيل نظام الرَّد بـ ${plan.messages} رسالة.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button
                        className="h-11 text-sm font-bold rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 hover:text-white border border-purple-500/30 hover:border-purple-500/50 transition-all duration-300"
                      >
                        اشترك الآن
                      </Button>
                    </a>
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

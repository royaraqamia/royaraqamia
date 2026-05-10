import { Button } from './ui/button';
import {
  Check,
  CurrencyDollar,
  TrendUp,
  Calculator,
  Sparkle,
  Users,
  Receipt,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function ExchangeManagement() {
  const features = [
    {
      icon: Receipt,
      title: 'تتبُّع عمليَّات الصَّرافة',
      description: 'سجِّل كل عمليَّات الصَّرافة والحوَّالات الماليَّة بدقَّة وسرعة.',
    },
    {
      icon: Calculator,
      title: 'حساب الأرباح والرُّسوم',
      description: 'احسب تلقائيًّا الأرباح والرُّسوم لكل عمليَّة بدون جهد يدوي.',
    },
    {
      icon: Users,
      title: 'إدارة الزَّبائن',
      description: 'نظِّم بيانات الزَّبائن وتتبَّع معاملاتهم بسهولة.',
    },
    {
      icon: TrendUp,
      title: 'تقارير ماليَّة شاملة',
      description: 'احصل على نظرة واضحة على أداء عملك عبر تقارير مفصَّلة.',
    },
  ];

  return (
    <section id="exchange-management" className="section-spacing relative overflow-hidden">
      {/* Background with Lime Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-lime-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-lime-600/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-lime-400">
نظام الصَّرافة والحوَّالات
              </span>
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              نظام متكامل عبر Google Sheets لإدارة عمليَّات الصَّرافة والحوَّالات الماليَّة، يُتيح لك
              تتبُّع المعاملات، حساب الأرباح، وإدارة الزَّبائن بسهولة وفعاليَّة.
            </p>
          </div>
        </ScrollAnimation>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Features */}
          <ScrollAnimation animation="slide-right" duration={0.7}>
            <div className="space-y-6">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 p-5 rounded-2xl bg-lime-500/5 border border-lime-500/10 hover:border-lime-500/30 hover:bg-lime-500/10 transition-all duration-300 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lime-500 to-lime-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-lime-500/30 transition-all duration-300">
                    <feature.icon className="w-6 h-6 text-white" />
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

          {/* Right: Pricing & CTA Card */}
          <ScrollAnimation animation="slide-left" duration={0.7} delay={0.2}>
            <div className="relative p-[1px] rounded-3xl overflow-hidden group">
              {/* Animated Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-lime-500/30 to-lime-600/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-[spin_3s_linear_infinite]" />
              <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-3xl z-0" />

              <div className="relative z-10 p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl">
                {/* Price Display */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-lime-500/10 border border-lime-500/20 mb-4">
                    <Sparkle className="w-4 h-4 text-lime-400" weight="fill" />
                    <span className="text-sm font-medium text-lime-400">دفعة واحدة فقط</span>
                  </div>
                  <div className="text-6xl font-bold text-lime-400 mb-2">$100</div>
                  <p className="text-slate-400 text-sm">امتلاك دائم — بدون اشتراكات شهريَّة</p>
                </div>

                {/* What You Get */}
                <div className="space-y-3 mb-6">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    ما ستحصل عليه:
                  </h4>
                  {[
                    'ملف Google Sheets جاهز للاستخدام',
                    'حسابات تلقائيَّة للأرباح والرُّسوم',
                    'نظام إدارة الزَّبائن المتكامل',
                    'دعم فنِّي بعد الشِّراء',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-lime-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-lime-400" />
                      </div>
                      <span className="text-sm text-slate-200">{item}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <a
                  href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في الحصول على نظام إدارة الصَّرافة والحوَّالات."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-600 hover:to-lime-700 text-white shadow-lg shadow-lime-500/25 hover:shadow-lime-500/40 transition-all duration-300">
                    <CurrencyDollar className="w-5 h-5 ml-2" weight="fill" />
                    احصل عليه الآن
                  </Button>
                </a>
              </div>
            </div>
          </ScrollAnimation>
        </div>
      </div>
    </section>
  );
}

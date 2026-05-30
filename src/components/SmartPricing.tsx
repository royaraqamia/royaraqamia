import { Button } from './ui/button';
import {
  ChartBar,
  Check,
  CurrencyDollar,
  TrendUp,
  Calculator,
  Clock,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function SmartPricing() {
  const features = [
    {
      icon: CurrencyDollar,
      title: 'تسعير ديناميكي بضغطة زر',
      description: 'عدِّل سعر الصَّرف في الإعدادات، وشاهد أسعار محلَّك بالكامل (جملة ومفرَّق) تتحدَّث في ثانية واحدة.',
    },
    {
      icon: Calculator,
      title: 'أرباحك الحقيقيَّة بلا أوهام',
      description: 'النِّظام يحسب متوسِّط التَّكلفة بدقَّة، ويخصم المصاريف التَّشغيليَّة تلقائيًّا ليعطيك صافي الرِّبح الحقيقي.',
    },
    {
      icon: TrendUp,
      title: 'سيطرة تامَّة على الدُّيون',
      description: 'كشوفات حساب لحظيَّة تراقب مسحوبات وتسديدات الزَّبائن والمورِّدين، لتعرف ما لك وما عليك فورًا.',
    },
    {
      icon: Clock,
      title: 'وداعًا للأخطاء البشريَّة',
      description: 'نظام ذكي مُبرمَج بالألوان يوجِّه الكاشير، يمنع بيع مواد غير متوفِّرة، ويوفِّر مئات السَّاعات من الجرد والمطابقات.',
    },
  ];

  return (
    <section id="smart-pricing" className="section-spacing relative overflow-hidden">
      {/* Background with Emerald Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-emerald-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-teal-500/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-emerald-400">
                نظام إدارة الأعمال (Mini ERP)
              </span>
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              أقوى نظام مالي سحابي مَبني على بيئة Google Sheets. مُصمَّم خصِّيصًا لأتمتة التَّسعير، ضبط المخزون، وحساب الأرباح الصَّافية لحظيًّا مع كل تغيُّر في سعر الصَّرف، لتُدير تجارتك بذكاء وبدون أخطاء.
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
                  className="flex items-start gap-4 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-300 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/30 transition-all duration-300">
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
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/30 to-teal-500/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-[spin_3s_linear_infinite]" />
              <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-3xl z-0" />

              <div className="relative z-10 p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl">
                {/* Price Display */}
                <div className="text-center mb-6 space-y-4">
                  <div className="text-6xl font-bold text-emerald-400 mb-2">$50</div>
                  <p className="text-slate-400 text-sm">اشتراك شهري</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-emerald-400 font-bold text-lg">$450</span>
                    <span className="text-slate-400 text-sm">/ سنة</span>
                    <span className="text-xs text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">خصم 25%</span>
                  </div>
                </div>

                {/* What You Get */}
                <div className="space-y-3 mb-6">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    ما ستحصل عليه:
                  </h4>
                  {[
                    'ملف Google Sheets جاهز وفوري الاستخدام',
                    'لوحة قيادة مركزيَّة لمراقبة الأرباح وحركة الأموال',
                    'نظام مضاد للأخطاء البشريَّة يُوجِّه موظَّفيك بذكاء',
                    'دعم فنِّي مستمر وتحديثات مجَّانيَّة دوريَّة',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span className="text-sm text-slate-200">{item}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <a
                  href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في الحصول على نظام التَّسعير الذَّكي."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300">
                    <ChartBar className="w-5 h-5 ml-2" weight="fill" />
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

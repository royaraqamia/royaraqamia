import { Button } from './ui/button';
import {
  CreditCard,
  ShieldCheck,
  Clock,
  Globe,
  Receipt,
  ArrowRight,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function PaymentService() {
  const benefits = [
    { icon: ShieldCheck, text: 'أمان كامل لبياناتك الماليَّة' },
    { icon: Clock, text: 'تنفيذ سريع خلال 24 ساعة' },
    { icon: Globe, text: 'دعم جميع المنصَّات الرَّقميَّة المتاحة' },
    { icon: Receipt, text: 'رسوم ثابتة وشفَّافة بدون مفاجآت' },
  ];

  return (
    <section id="payment-service" className="section-spacing relative overflow-hidden">
      {/* Background with Pink Gradients */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 left-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-pink-500/10 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-rose-500/10 rounded-full blur-[100px] translate-y-1/3 translate-x-1/4 animate-pulse-slow delay-1000" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-pink-400">
                الدَّفع الإلكتروني
              </span>{' '}
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              تنفيذ عمليَّات الدَّفع أونلاين نيابةً عنك لتسهيل المشتريات والاشتراكات الرَّقميَّة
              بسرعة وأمان.
            </p>
          </div>
        </ScrollAnimation>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Benefits */}
          <ScrollAnimation animation="slide-right" duration={0.7}>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3
                  className="text-2xl md:text-3xl font-bold text-white"
                  style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                >
                  لماذا تختار خدمة الدَّفع لدينا؟
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  نوفِّر عليك عناء البحث عن طرق الدَّفع المناسبة، ونتولَّى تنفيذ عمليَّات الشِّراء
                  والاشتراكات نيابةً عنك بكل احترافيَّة.
                </p>
              </div>

              {/* Benefits List */}
              <div className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 p-4 rounded-xl bg-pink-500/5 border border-pink-500/10 hover:border-pink-500/30 hover:bg-pink-500/10 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                      <benefit.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm md:text-base text-slate-200 group-hover:text-white transition-colors">
                      {benefit.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ScrollAnimation>

          {/* Right: Pricing Cards */}
          <ScrollAnimation animation="slide-left" duration={0.7} delay={0.2}>
            <div className="space-y-6">
              <h3
                className="text-xl font-bold text-white text-center mb-6"
                style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
              >
                رسوم الخدمة
              </h3>

              {/* Small Transactions */}
              <div className="p-6 rounded-2xl bg-pink-500/10 border border-pink-500/20 hover:border-pink-500/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-600/20 flex items-center justify-center">
                      <Receipt className="w-6 h-6 text-pink-400" />
                    </div>
                    <div>
                      <h4
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        العمليَّات الصَّغيرة
                      </h4>
                      <p className="text-xs text-slate-400">أقل من 100$</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-pink-400">$10</div>
                    <div className="text-xs text-slate-500">رسوم ثابتة</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <ArrowRight className="w-4 h-4 text-pink-400" />
                  <span>مثال: اشتراكات شهريَّة، تطبيقات، خدمات رقميَّة</span>
                </div>
              </div>

              {/* Large Transactions */}
              <div className="p-6 rounded-2xl bg-pink-500/10 border border-pink-500/20 hover:border-pink-500/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-600/20 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-pink-400" weight="fill" />
                    </div>
                    <div>
                      <h4
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                      >
                        العمليَّات الكبيرة
                      </h4>
                      <p className="text-xs text-slate-400">$100 فما فوق</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-pink-400">$25</div>
                    <div className="text-xs text-slate-500">رسوم ثابتة</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <ArrowRight className="w-4 h-4 text-pink-400" />
                  <span>مثال: أجهزة، برامج مؤسَّسات، مشتريات بالجملة</span>
                </div>
              </div>

              {/* CTA Button */}
              <a
                href="https://wa.me/963968478904?text=السَّلام عليكم، أرغب في استخدام خدمة الدَّفع الإلكتروني المُباشر."
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all duration-300">
                  <CreditCard className="w-5 h-5 ml-2" weight="fill" />
                  اطلب الخدمة الآن
                </Button>
              </a>
            </div>
          </ScrollAnimation>
        </div>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'motion/react';
import { PlusCircle, CheckCircle, Fire } from '@phosphor-icons/react';

const steps = [
  {
    number: '01',
    title: 'أضف عادة',
    description:
      'حدِّد العادات التي تريد بناءها. الروتين الصباحي، التمارين، القراءة — أي شيء يهمك.',
    icon: PlusCircle,
  },
  {
    number: '02',
    title: 'تتبَّع يومياً',
    description: 'سجِّل حضورك يومياً وحدِّد تقدُّمك. متابعة بنعم/لا تستغرق ثوانٍ.',
    icon: CheckCircle,
  },
  {
    number: '03',
    title: 'ابنِ السلاسل',
    description: 'شاهد سلسلتك تنمو كلما حافظت على انتظامك. كل يوم يبني على الذي يليه.',
    icon: Fire,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-spacing">
      <div className="max-w-6xl mx-auto container-padding">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            سير عمل بسيط
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            ثلاث خطوات ل<span className="gradient-text">عادات دائمة</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            ابدأ صغيراً، واظب باستمرار، وشاهد عاداتك تغيِّر حياتك.
          </p>
        </motion.div>

        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-linear-to-r from-primary/20 via-primary/40 to-primary/20 -translate-y-1/2" />

          <div className="grid lg:grid-cols-3 gap-12 lg:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex flex-col items-center text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 + 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                  className="relative z-10 w-20 h-20 rounded-2xl bg-card border border-border/50 flex items-center justify-center mb-8 shadow-lg shadow-primary/5"
                >
                  <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-primary/10 to-transparent" />
                  <step.icon size={32} className="text-primary relative z-10" />
                </motion.div>

                <span className="text-5xl font-bold text-primary/10 mb-4 leading-none">
                  {step.number}
                </span>

                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed max-w-xs">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

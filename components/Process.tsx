'use client';

import { memo } from 'react';
import { MagnifyingGlass, PencilLine, Palette, Code, RocketLaunch } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { ScrollAnimation } from './ScrollAnimations';

interface ProcessStep {
  icon: React.ElementType;
  number: string;
  title: string;
  description: string;
  details: string[];
}

const steps: ProcessStep[] = [
  {
    icon: MagnifyingGlass,
    number: '01',
    title: 'اكتشف',
    description: 'نفهم الفكرة والتحدي والجمهور',
    details: ['تحليل الاحتياجات', 'دراسة المنافسين', 'تحديد الأهداف'],
  },
  {
    icon: PencilLine,
    number: '02',
    title: 'خطط',
    description: 'نبني هيكل المشروع والمسار',
    details: ['هندسة المعلومات', 'تدفقات الاستخدام', 'خريطة المحتوى'],
  },
  {
    icon: Palette,
    number: '03',
    title: 'صمّم',
    description: 'نصمّم التجربة والواجهات',
    details: ['تصميم UI/UX', 'نظام تصميم', 'نماذج تفاعلية'],
  },
  {
    icon: Code,
    number: '04',
    title: 'طوّر',
    description: 'نبني المنتج بكود نظيف',
    details: ['تطوير واجهات', 'ربط قواعد البيانات', 'اختبارات الجودة'],
  },
  {
    icon: RocketLaunch,
    number: '05',
    title: 'أطلق',
    description: 'ننشر ونراقب ونطور',
    details: ['استضافة ونشر', 'مراقبة الأداء', 'دعم وتطوير مستمر'],
  },
];

export const Process = memo(function Process() {
  return (
    <section id="process" className="relative py-24 lg:py-32 overflow-hidden bg-[#050810]">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-0 w-150 h-150 bg-indigo-600/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/3 left-0 w-125 h-125 bg-purple-600/5 rounded-full blur-[150px]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-sm font-medium text-white/80">منهجيتنا</span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl mb-6 font-extrabold tracking-tight text-white">
              رحلة واضحة من <span className="gradient-text">الفكرة</span> إلى الإطلاق
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-white/60 leading-relaxed font-medium max-w-2xl mx-auto">
              نعمل بمنهجية منظمة تساعدك على رؤية التقدّم في كل مرحلة. نبني خطوة بخطوة حتى يكون لكل
              قرار سبب واضح.
            </p>
          </div>
        </ScrollAnimation>

        {/* Process Steps Timeline */}
        <div className="relative">
          {/* Desktop: Horizontal Line */}
          <div className="hidden lg:block absolute top-22 left-[10%] right-[10%] h-px bg-linear-to-r from-indigo-500/40 via-purple-500/40 to-violet-500/40" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-6">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.6, delay: index * 0.15 }}
                  className="group relative flex flex-col items-center text-center"
                >
                  {/* Number + Icon Circle */}
                  <div className="relative mb-8">
                    {/* Outer ring pulse */}
                    <div className="absolute inset-0 rounded-full bg-linear-to-br from-indigo-500/20 to-purple-500/20 blur-xl group-hover:blur-2xl transition-all duration-500 scale-150 opacity-0 group-hover:opacity-100" />
                    {/* Circle */}
                    <div className="relative w-19 h-19 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all duration-500 group-hover:border-indigo-400/40 group-hover:bg-indigo-500/10 group-hover:scale-110">
                      <Icon className="w-7 h-7 text-white/60 group-hover:text-indigo-300 transition-all duration-500" />
                    </div>
                    {/* Step number */}
                    <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">{step.number}</span>
                    </div>
                    {/* Connector dot */}
                    <div className="hidden lg:block absolute top-1/2 -left-[calc(50%+38px)] w-[calc(100%+96px)] h-0.5">
                      <div className="w-full h-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-white mb-2 transition-colors duration-300 group-hover:text-indigo-300">
                    {step.title}
                  </h3>
                  <p className="text-sm md:text-base text-white/50 mb-6 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Details List */}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
});

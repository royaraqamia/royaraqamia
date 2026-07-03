import {
  Trophy,
  Clock,
  Target,
  Sparkle,
  Code,
  HardDrive,
  Briefcase,
  User,
} from '@phosphor-icons/react';
import { Button } from './ui/button';
import { ScrollAnimation } from './ScrollAnimations';

export function TrainingCourses() {
  const course = {
    title: 'بناء منتجات رقميَّة من الصِّفر',
    description:
      'نظام عمل متكامل: استخدم LLM Code Agent  لبناء مواقع إلكترونيَّة وتطبيقات. أنت هنا المدير والأدوات هي فريق العمل.',
    trainer: 'م. أيْهَم العَلي',
    duration: '18 ساعة',
    sessions: '12 جلسة',
    price: '$50',
  };

  const highlights = [
    {
      icon: Target,
      label: 'مسار الـ Zero-Code',
      description: 'ابنِ مشاريع معقَّدة دون كتابة كود.',
    },
    {
      icon: Sparkle,
      label: 'مشروع جاهز للبيع',
      description: 'لا نخرج بمجرَّد واجهة، بل بمنتج رقمي كامل.',
    },
    {
      icon: Trophy,
      label: 'أدوات المستقبل',
      description: 'إتقان عملي لـ Vercel ،GitHub ،Devin، ... .',
    },
  ];

  const features = [
    { icon: Code, text: 'احتراف التَّوجيه لبناء التَّطبيقات وربط قواعد البيانات.' },
    { icon: HardDrive, text: 'رفع المشاريع على سيرفرات حقيقيَّة.' },
    { icon: Briefcase, text: 'تحويل المهارة إلى دخل: كيف تبيع خدماتك أو تطلق مشروعك الخاص.' },
  ];

  return (
    <section id="training" className="section-spacing bg-muted/30 relative overflow-hidden">
      {/* Enhanced Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-[#14B8A6]/10 via-transparent to-transparent pointer-events-none" />
      <div
        className="absolute top-20 right-10 w-48 h-48 bg-[#14B8A6] opacity-[0.05] rounded-full blur-3xl pointer-events-none motion-safe:animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute bottom-20 left-10 w-56 h-56 bg-[#0891B2] opacity-[0.04] rounded-full blur-3xl pointer-events-none motion-safe:animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '1s' }}
      />

      <div className="max-w-5xl mx-auto container-padding relative">
        {/* Section Header - Compelling Single Course Message */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center section-header mb-12">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              <span className="text-teal-400">التَّدريب</span>
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl mx-auto leading-[1.8] sm:leading-[1.9]">
              المسار التَّدريبي العربي المتكامل الذي ينقلك من فكرة إلى مشروع قائم دون كتابة كود.
            </p>
          </div>
        </ScrollAnimation>

        {/* Single Course Hero Card */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="relative">
            {/* Main Card */}
            <div className="glass-card rounded-3xl md:rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl shadow-[#14B8A6]/10">
              {/* Card Header with Gradient */}
              <div
                className="p-6 md:p-8 text-white relative overflow-hidden"
                style={{
                  background:
                    'linear-gradient(135deg, #020617 0%, #3b0764 40%, #1e1b4b 70%, #0f172a 100%)',
                }}
              >
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#14B8A6]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0891B2]/15 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

                <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  {/* Course Title & Level */}
                  <div className="flex-1">
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm border mb-4"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.1) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                      <span className="text-xs font-medium text-emerald-300">التَّسجيل مفتوح</span>
                    </div>
                    <h3
                      className="text-2xl md:text-3xl font-bold mb-2"
                      style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                    >
                      {course.title}
                    </h3>
                    <p className="text-white/80 text-sm md:text-base leading-relaxed max-w-lg">
                      {course.description}
                    </p>
                  </div>

                  {/* Price Badge */}
                  <div className="text-center md:text-start flex-shrink-0">
                    <div className="flex items-baseline gap-2 justify-center md:justify-start">
                      <div className="text-4xl md:text-5xl font-bold tracking-tight text-teal-400">
                        {course.price}
                      </div>
                    </div>
                    <div className="text-xs text-white/60 mt-1">للدَّورة كاملة</div>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 md:p-8">
                {/* Highlights Grid - First for immediate value proposition */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {highlights.map((highlight, idx) => (
                    <div
                      key={idx}
                      className={`text-center p-4 rounded-2xl bg-[#14B8A6]/5 border border-[#14B8A6]/10 transition-all duration-300 ${
                        idx === 1
                          ? 'sm:scale-105 sm:shadow-xl sm:shadow-[#14B8A6]/15 sm:border-[#14B8A6]/25 sm:bg-[#14B8A6]/10'
                          : ''
                      }`}
                    >
                      <div
                        className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[#14B8A6] to-[#0891B2] flex items-center justify-center shadow-lg shadow-[#14B8A6]/25 ${
                          idx === 1 ? 'w-14 h-14' : ''
                        }`}
                      >
                        <highlight.icon
                          className={`text-white ${idx === 1 ? 'w-7 h-7' : 'w-6 h-6'}`}
                        />
                      </div>
                      <div className="font-bold text-sm mb-1">{highlight.label}</div>
                      <div className="text-xs text-foreground/70">{highlight.description}</div>
                    </div>
                  ))}
                </div>

                {/* Course Details Row - Trainer, Duration, Sessions */}
                <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6 mb-8 py-6 border-y border-border/30">
                  {/* Trainer - own row on mobile */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#14B8A6]/10 flex items-center justify-center">
                      <User className="w-4 h-4 sm:w-5 sm:h-5 text-[#14B8A6]" />
                    </div>
                    <div>
                      <div className="text-xs text-foreground/50">المدرِّب</div>
                      <div className="font-bold text-sm sm:text-base">{course.trainer}</div>
                    </div>
                  </div>
                  {/* Horizontal divider on mobile, vertical on desktop */}
                  <div className="w-32 h-px bg-border/30 sm:hidden" />
                  <div className="hidden sm:block w-px h-12 bg-border/30" />
                  {/* Duration + Sessions - grouped on mobile */}
                  <div className="flex items-center gap-4 sm:gap-6">
                    {/* Duration */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#14B8A6]/10 flex items-center justify-center">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#14B8A6]" />
                      </div>
                      <div>
                        <div className="text-xs text-foreground/50">المدَّة الكلِّيَّة</div>
                        <div className="font-bold text-sm sm:text-base">{course.duration}</div>
                      </div>
                    </div>
                    <div className="w-px h-12 bg-border/30 sm:hidden" />
                    <div className="hidden sm:block w-px h-12 bg-border/30" />
                    {/* Sessions */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#14B8A6]/10 flex items-center justify-center">
                        <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-[#14B8A6]" />
                      </div>
                      <div>
                        <div className="text-xs text-foreground/50">عدد الجلسات</div>
                        <div className="font-bold text-sm sm:text-base">{course.sessions}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <div className="mb-8">
                  <h4 className="text-sm font-bold text-foreground/70 mb-4 text-center">
                    ماذا ستتعلَّم؟
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {features.map((feature, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/20 group hover:border-[#14B8A6]/30 hover:bg-[#14B8A6]/5 transition-colors duration-200 ${
                          idx === features.length - 1 ? 'md:col-span-2' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#14B8A6]/20 transition-colors">
                          <feature.icon className="w-4 h-4 text-[#14B8A6]" />
                        </div>
                        <span className="text-sm font-medium">{feature.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <a
                  href={`https://wa.me/963968478904?text=${encodeURIComponent('السَّلام عليكم، أرغب في التَّسجيل في المسار التَّدريبي المتكامل.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  aria-label={`احجز مقعدك في دورة ${course.title} عبر واتساب`}
                >
                  <Button className="w-full gradient-primary text-white font-bold hover:opacity-90 motion-safe:hover:scale-[1.01] transition-all rounded-full h-14 text-lg shadow-xl shadow-primary/30">
                    احجز مقعدك الآن
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

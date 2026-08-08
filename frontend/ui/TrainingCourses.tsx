import {
  Trophy,
  Clock,
  Target,
  Sparkle,
  Code,
  HardDrive,
  Briefcase,
  User,
  ArrowLeft,
  CheckCircle,
  ShieldCheck,
  Star,
  Lightning,
} from '@phosphor-icons/react/ssr';
import { Button } from './primitives/button';
import { ScrollAnimation } from './ScrollAnimations';
import { WHATSAPP_PHONE } from '@/frontend/shared/constants';

export function TrainingCourses() {
  const course = {
    title: 'بناء منتجات رقميَّة من الصِّفر',
    description:
      'نظام عمل متكامل: استخدم LLM Code Agent لبناء مواقع إلكترونيَّة وتطبيقات. أنت هنا المدير والأدوات هي فريق العمل.',
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
      badge: 'الهدف الرَّئيسي',
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
    { icon: Briefcase, text: 'تحويل المهارة إلى دخل: كيف تبيع خدماتك أو تُطلق مشروعك الخاص.' },
  ];

  return (
    <section
      id="training"
      className="relative py-20 lg:py-28 overflow-hidden bg-background text-foreground"
    >
      {/* Background Ambient Lights & Pattern Grid */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-250 h-125 bg-radial from-purple-600/15 via-violet-600/5 to-transparent blur-3xl opacity-70" />
        <div
          className="absolute top-1/4 -right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl motion-safe:animate-pulse"
          style={{ animationDuration: '8s' }}
        />
        <div
          className="absolute bottom-10 -left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl motion-safe:animate-pulse"
          style={{ animationDuration: '10s', animationDelay: '2s' }}
        />

        {/* Modern Micro Dot Pattern Mask */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center mb-12 lg:mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-semibold mb-4 backdrop-blur-md">
              <Lightning className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
              <span>المسار التَّدريبي التَّطبيقي</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4 text-foreground">
              <span className="bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-400 bg-clip-text text-transparent">
                التَّدريب
              </span>
            </h2>

            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed font-medium">
              المسار التَّدريبي العربي المتكامل الذي ينقلك من فكرة إلى مشروع قائم دون كتابة كود.
            </p>
          </div>
        </ScrollAnimation>

        {/* Master Course Container Card */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="relative rounded-3xl sm:rounded-[2.5rem] p-px bg-linear-to-b from-purple-500/30 via-border/40 to-purple-500/10 shadow-2xl shadow-purple-950/10 dark:shadow-purple-950/30">
            <div className="rounded-[calc(1.5rem-1px)] sm:rounded-[calc(2.5rem-1px)] bg-card text-card-foreground overflow-hidden backdrop-blur-xl">
              {/* Card Banner Header */}
              <div className="relative p-6 sm:p-8 lg:p-10 text-white overflow-hidden bg-linear-to-br from-slate-950 via-purple-950/90 to-slate-900 border-b border-white/10">
                {/* Decorative Visual Background Elements */}
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 lg:gap-8">
                  {/* Course Title & High-level Pitch */}
                  <div className="flex-1 space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 backdrop-blur-md">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-semibold text-purple-200 tracking-wide">
                        التَّسجيل مفتوح حاليًّا
                      </span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                      {course.title}
                    </h3>

                    <p className="text-purple-100/80 text-sm sm:text-base leading-relaxed max-w-xl font-normal">
                      {course.description}
                    </p>
                  </div>

                  {/* Pricing Badge Box */}
                  <div className="shrink-0 self-start md:self-center">
                    <div className="relative rounded-2xl bg-white/5 border border-white/15 p-5 sm:p-6 backdrop-blur-xl text-center md:text-right shadow-inner min-w-0 sm:min-w-45">
                      <div className="text-xs text-purple-200/80 font-medium mb-1">
                        رسوم الاستثمار
                      </div>
                      <div className="flex items-baseline justify-center md:justify-start gap-1">
                        <span className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-linear-to-r from-purple-200 via-white to-purple-300">
                          {course.price}
                        </span>
                      </div>
                      <div className="text-[11px] text-purple-300/70 mt-1.5 font-medium flex items-center justify-center md:justify-start gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>للدَّورة كاملة</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Main Content */}
              <div className="p-6 sm:p-8 lg:p-10 space-y-8 sm:space-y-10">
                {/* 1. Value Pillars Highlights */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    {highlights.map((highlight, idx) => {
                      const IconComponent = highlight.icon;
                      const isFeatured = idx === 1;

                      return (
                        <div
                          key={idx}
                          className={`relative rounded-2xl p-5 sm:p-6 transition-all duration-300 flex flex-col justify-between border ${
                            isFeatured
                              ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/30 shadow-lg shadow-purple-500/5'
                              : 'bg-muted/30 dark:bg-white/2 border-border/50 hover:border-purple-500/20 hover:bg-muted/50'
                          }`}
                        >
                          {isFeatured && (
                            <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-linear-to-r from-purple-600 to-violet-600 text-[10px] font-bold text-white shadow-xs">
                              {highlight.badge || 'الهدف الرَّئيسي'}
                            </div>
                          )}

                          <div>
                            <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20 mb-4">
                              <IconComponent className="w-6 h-6" />
                            </div>

                            <h4 className="font-bold text-base text-foreground mb-1.5">
                              {highlight.label}
                            </h4>

                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                              {highlight.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Specs Meta Bar */}
                <div className="rounded-2xl bg-muted/40 dark:bg-white/3 border border-border/60 p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/40 gap-4 sm:gap-0">
                    {/* Trainer Info */}
                    <div className="flex items-center gap-3.5 sm:px-4 first:sm:pr-0 last:sm:pl-0 pt-2 sm:pt-0">
                      <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-medium text-muted-foreground">
                          المدرِّب
                        </span>
                        <span className="block text-sm sm:text-base font-bold text-foreground truncate">
                          {course.trainer}
                        </span>
                      </div>
                    </div>

                    {/* Total Duration */}
                    <div className="flex items-center gap-3.5 sm:px-4 pt-3 sm:pt-0">
                      <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-medium text-muted-foreground">
                          المدَّة الكلِّيَّة
                        </span>
                        <span className="block text-sm sm:text-base font-bold text-foreground truncate">
                          {course.duration}
                        </span>
                      </div>
                    </div>

                    {/* Sessions Count */}
                    <div className="flex items-center gap-3.5 sm:px-4 pt-3 sm:pt-0">
                      <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-medium text-muted-foreground">
                          عدد الجلسات
                        </span>
                        <span className="block text-sm sm:text-base font-bold text-foreground truncate">
                          {course.sessions}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Features & Curriculum Breakdown */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="w-4 h-4 text-purple-500 fill-purple-500" />
                    <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
                      ماذا ستتعلَّم في هذه الدَّورة؟
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    {features.map((feature, idx) => {
                      const IconComponent = feature.icon;
                      return (
                        <div
                          key={idx}
                          className="group/feat flex items-start gap-3.5 p-4 rounded-xl bg-background border border-border/60 hover:border-purple-500/30 hover:bg-purple-500/3 transition-all duration-200"
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-purple-600 dark:text-purple-400 group-hover/feat:bg-purple-500 group-hover/feat:text-white transition-colors duration-200 mt-0.5">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <span className="text-xs sm:text-sm font-medium text-foreground/90 leading-relaxed">
                            {feature.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. CTA Button & Trust Badges */}
                <div className="pt-2">
                  <a
                    href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent('السَّلام عليكم، أرغب في التَّسجيل في التَّدريب.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                    aria-label={`احجز مقعدك في دورة ${course.title} عبر واتساب`}
                  >
                    <Button className="relative overflow-hidden w-full h-14 sm:h-16 rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white font-bold text-base sm:text-lg shadow-xl shadow-purple-600/25 hover:shadow-purple-600/40 hover:scale-[1.005] active:scale-[0.995] transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 border-0">
                      {/* Animated Light Shimmer Beam */}
                      <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

                      <span>احجز مقعدك الآن</span>
                      <ArrowLeft className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1 duration-300" />
                    </Button>
                  </a>

                  {/* Trust Footer Badges */}
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground mt-4 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      تأكيد حجز فوري
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      متابعة وإرشاد شخصي
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      تطبيقات عمليَّة 100%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

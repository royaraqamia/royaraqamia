import {
  ChatCircle,
  Graph,
  Check,
  CreditCard,
  ChartBar,
  Robot,
  Code,
  CurrencyDollar,
  Lightbulb,
  Storefront,
  GraduationCap,
  Bank,
} from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';
import { useUI } from '../context/UIContext';

export function Services() {
  // Color configurations for each service
  const colorConfigs = {
    teal: {
      gradient: 'linear-gradient(135deg, #14B8A6 0%, #0891B2 100%)',
      accentBorder: '#14B8A6',
      hoverGradient: 'linear-gradient(90deg, #14B8A6, #0891B2, #14B8A6)',
      glowColor: 'rgba(20, 184, 166, 0.3)',
    },
    orange: {
      gradient: 'linear-gradient(135deg, #F97316 0%, #D97706 100%)',
      accentBorder: '#F97316',
      hoverGradient: 'linear-gradient(90deg, #F97316, #D97706, #F97316)',
      glowColor: 'rgba(249, 115, 22, 0.3)',
    },
    blue: {
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      accentBorder: '#3B82F6',
      hoverGradient: 'linear-gradient(90deg, #3B82F6, #2563EB, #3B82F6)',
      glowColor: 'rgba(59, 130, 246, 0.3)',
    },
    pink: {
      gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
      accentBorder: '#EC4899',
      hoverGradient: 'linear-gradient(90deg, #EC4899, #DB2777, #EC4899)',
      glowColor: 'rgba(236, 72, 153, 0.3)',
    },
    emerald: {
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      accentBorder: '#10B981',
      hoverGradient: 'linear-gradient(90deg, #10B981, #059669, #10B981)',
      glowColor: 'rgba(16, 185, 129, 0.3)',
    },
    violet: {
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      accentBorder: '#8B5CF6',
      hoverGradient: 'linear-gradient(90deg, #8B5CF6, #7C3AED, #8B5CF6)',
      glowColor: 'rgba(139, 92, 246, 0.3)',
    },
    purple: {
      gradient: 'linear-gradient(135deg, #A855F7 0%, #6366F1 100%)',
      accentBorder: '#A855F7',
      hoverGradient: 'linear-gradient(90deg, #A855F7, #6366F1, #A855F7)',
      glowColor: 'rgba(168, 85, 247, 0.3)',
    },
    amber: {
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      accentBorder: '#F59E0B',
      hoverGradient: 'linear-gradient(90deg, #F59E0B, #D97706, #F59E0B)',
      glowColor: 'rgba(245, 158, 11, 0.3)',
    },
    rose: {
      gradient: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)',
      accentBorder: '#F43F5E',
      hoverGradient: 'linear-gradient(90deg, #F43F5E, #E11D48, #F43F5E)',
      glowColor: 'rgba(244, 63, 94, 0.3)',
    },
    cyan: {
      gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
      accentBorder: '#06B6D4',
      hoverGradient: 'linear-gradient(90deg, #06B6D4, #0891B2, #06B6D4)',
      glowColor: 'rgba(6, 182, 212, 0.3)',
    },
    indigo: {
      gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
      accentBorder: '#6366F1',
      hoverGradient: 'linear-gradient(90deg, #6366F1, #4F46E5, #6366F1)',
      glowColor: 'rgba(99, 102, 241, 0.3)',
    },
    lime: {
      gradient: 'linear-gradient(135deg, #84CC16 0%, #65A30D 100%)',
      accentBorder: '#84CC16',
      hoverGradient: 'linear-gradient(90deg, #84CC16, #65A30D, #84CC16)',
      glowColor: 'rgba(132, 204, 22, 0.3)',
    },
    coral: {
      gradient: 'linear-gradient(135deg, #FB7185 0%, #F43F5E 100%)',
      accentBorder: '#FB7185',
      hoverGradient: 'linear-gradient(90deg, #FB7185, #F43F5E, #FB7185)',
      glowColor: 'rgba(251, 113, 133, 0.3)',
    },
  };

  type ServiceType = {
    icon: typeof ChatCircle;
    title: string;
    description: string;
    features: string[];
    pricing: {
      cta: string;
      monthly?: string;
      yearly?: string;
      training?: string;
      consultation?: string;
      free?: string;
      employer?: string;
      small?: string;
      large?: string;
      oneTime?: string;
      basic?: string;
      webapp?: string;
      mobile?: string;
    };
    colorKey: 'teal' | 'orange' | 'blue' | 'pink' | 'emerald' | 'violet' | 'purple' | 'amber' | 'rose' | 'cyan' | 'indigo' | 'lime' | 'coral';
    shadowColor: string;
    hoverShadow: string;
    href: string;
    categories: string[];
  };

  const services: ServiceType[] = [
    {
      icon: ChatCircle,
      title: 'التَّدريب',
      description:
        'المسار التَّدريبي العربي المتكامل الذي يعلِّمك بناء موقع إلكتروني أو تطبيق دون كتابة كود.',
      features: [
        'يدرِّبك خبير متخصِّص في المجال',
        'لا تحتاج لكتابة أي سطر كود',
        'التَّدريب أونلاين مع مجموعة',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'teal' as const,
      shadowColor: 'shadow-teal-500/30',
      hoverShadow: 'group-hover/item:shadow-teal-500/50',
      href: '#training',
      categories: ['students'],
    },
    {
      icon: Lightbulb,
      title: 'الاستشارات',
      description:
        'نختصر عليك سنوات من البحث ونمنحك الخلاصة التِّقنيَّة والعمليَّة بصدق وأمانة.',
      features: [
        'استشارة متخصِّصة بالمواقع والتَّطبيقات',
        'نُجنِّبك خسائر الوقت والمال',
        'الاستشارة فرديَّة أونلاين صوتيَّة',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'rose' as const,
      shadowColor: 'shadow-rose-500/30',
      hoverShadow: 'group-hover/item:shadow-rose-500/50',
      href: '#consultation',
      categories: ['students'],
    },
    {
      icon: Graph,
      title: 'التَّشبيك',
      description: 'نربطك مع أصحاب المهارات أو أصحاب الأعمال المناسبين لاحتياجاتك ورغباتك.',
      features: [
        'نطابق صاحب المهارة مع صاحب المال',
        'شفافيَّة تامَّة مع الطَّرفين قبل التَّشبيك',
        'نغطِّي التَّشبيك في كافَّة المجالات الرَّقميَّة',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'orange' as const,
      shadowColor: 'shadow-orange-500/30',
      hoverShadow: 'group-hover/item:shadow-orange-500/50',
      href: '#networking',
      categories: ['students'],
    },
    {
      icon: CreditCard,
      title: 'الدَّفع الإلكتروني',
      description:
        'تنفيذ عمليَّات الدَّفع أونلاين نيابةً عنك لتسهيل المشتريات والاشتراكات الرَّقميَّة بسرعة وأمان.',
      features: [
        'دفع فوري وآمن للمشتريات',
        'رسوم ثابتة وشفَّافة',
        'دعم للعمليَّات الصَّغيرة والكبيرة',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'pink' as const,
      shadowColor: 'shadow-pink-500/30',
      hoverShadow: 'group-hover/item:shadow-pink-500/50',
      href: '#payment-service',
      categories: [''],
    },
    {
      icon: ChartBar,
      title: 'نظام إدارة الأعمال (Mini ERP)',
      description:
        'نظام مالي مُصمَّم خصِّيصًا لأتمتة التَّسعير، ضبط المخزون، وحساب الأرباح الصَّافية لحظيًّا مع كل تغيُّر في سعر الصَّرف.',
      features: [
        'تسعير ديناميكي وتحديث لحظي للأرباح',
        'حساب دقيق لمتوسِّط التَّكلفة والمصاريف',
        'أتمتة الدُّيون وإدارة ذكيَّة للمخزون',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'emerald' as const,
      shadowColor: 'shadow-emerald-500/30',
      hoverShadow: 'group-hover/item:shadow-emerald-500/50',
      href: '#smart-pricing',
      categories: ['merchants'],
    },
    {
      icon: CurrencyDollar,
      title: 'نظام الصَّرافة والحوَّالات',
      description:
        'نظام عبر Google Sheets لإدارة عمليَّات الصَّرافة والحوَّالات الماليَّة، يُتيح تتبُّع المعاملات، حساب الأرباح، وإدارة الزَّبائن بسهولة.',
      features: [
        'تتبُّع شامل لعمليَّات الصَّرافة والحوَّالات',
        'حساب تلقائي للأرباح والرُّسوم',
        'دعم فنِّي متكامل',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'lime' as const,
      shadowColor: 'shadow-lime-500/30',
      hoverShadow: 'group-hover/item:shadow-lime-500/50',
      href: '#exchange-management',
      categories: ['exchange'],
    },
    {
      icon: Robot,
      title: 'نظام الرَّد',
      description:
        'نردُّ على رسائل زبائنك عبر منصَّات المراسلة والتَّواصل الاجتماعي بشكل احترافي وبلغة طبيعيَّة.',
      features: ['ردود ذكيَّة واحترافيَّة', 'دعم متعدِّد المنصَّات', 'عمل مستمر دون توقُّف'],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'purple' as const,
      shadowColor: 'shadow-purple-500/30',
      hoverShadow: 'group-hover/item:shadow-purple-500/50',
      href: '#auto-reply',
      categories: ['merchants'],
    },
    {
      icon: Code,
      title: 'بناء مواقع إلكترونيَّة وتطبيقات',
      description:
        'خدمات تطوير متكاملة للمواقع والتَّطبيقات من الفكرة حتَّى الإطلاق. نبني حلول رقميَّة قابلة للتَّوسُّع، آمنة، وسهلة الاستخدام.',
      features: [
        'تطوير متكامل من الألف إلى الياء',
        'تقنيات حديثة وأفضل الممارسات',
        'بنية آمنة وقابلة للتَّوسُّع',
      ],
      pricing: {
        cta: 'قراءة المزيد',
      },
      colorKey: 'blue' as const,
      shadowColor: 'shadow-violet-500/30',
      hoverShadow: 'group-hover/item:shadow-violet-500/50',
      href: '#web-dev-service',
      categories: ['merchants'],
    },
    
  ];

  const tabs = [
    { id: 'merchants', label: 'للتُّجَّار ومقدِّمي الخدمات', icon: Storefront },
    { id: 'students', label: 'للطُّلاب والخرِّيجين الجدد', icon: GraduationCap },
    { id: 'exchange', label: 'لشركات الصَّرافة والحوَّالات', icon: Bank },
  ];

  const getTabCount = (tabId: string) => {
    return services.filter((s) => s.categories.includes(tabId)).length;
  };

  const { activeServicesTab, setActiveServicesTab } = useUI();

  const filteredServices = services.filter((service) =>
    service.categories.includes(activeServicesTab)
  );

  return (
    <section
      id="services"
      className="section-spacing"
    >
      {/* Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 right-1/4 w-64 h-64 bg-primary-600 opacity-[0.07] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-teal-500 opacity-[0.05] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '1s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-56 h-56 bg-orange-500 opacity-[0.04] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '5s', animationDelay: '2s' }}
        />
        <div
          className="absolute top-3/4 right-1/3 w-40 h-40 bg-blue-500 opacity-[0.04] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '7s', animationDelay: '3s' }}
        />
        <div
          className="absolute top-1/3 left-1/4 w-44 h-44 bg-pink-500 opacity-[0.03] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '1.5s' }}
        />
      </div>

<div className="max-w-7xl mx-auto container-padding">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
               ماذا <span className="gradient-text">نقدِّم</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              بُنية تحتيَّة شاملة للأفراد وأصحاب الأعمال تحت سقف واحد
            </p>
          </div>
        </ScrollAnimation>

        {/* Tabs */}
        <div className="py-2">
          {/* Mobile scroll fade indicator */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent pointer-events-none sm:hidden z-10" />
          <div className="flex overflow-x-auto justify-start sm:justify-center gap-2 p-2 scrollbar-hide sm:flex-wrap bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm max-w-7xl mx-auto container-padding">
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeServicesTab === tab.id;
                const count = getTabCount(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveServicesTab(tab.id)}
                    className={`h-10 sm:h-10 px-3 sm:px-4 rounded-xl font-bold text-[12px] sm:text-[13px] transition-all duration-300 flex items-center justify-center gap-2 touch-target flex-shrink-0 ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30 scale-105 border border-primary-500/50'
                        : 'text-foreground/70 hover:bg-white/10 hover:text-foreground border border-transparent hover:border-white/20'
                    }`}
                    style={{
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }}
                  >
                    <TabIcon
                      className={`w-4 h-4 sm:w-4 sm:h-4 transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]' : ''}`}
                      weight={isActive ? 'fill' : 'regular'}
                    />
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-white/25' : 'bg-white/10'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
        </div>

        {/* Services Grid Container */}
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mt-8">
          <div
            key={activeServicesTab}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
          {filteredServices.map((service, index) => {
            const Icon = service.icon;
            const colors = colorConfigs[service.colorKey];
            return (
              <ScrollAnimation key={index} animation="slide-up" delay={index * 0.1} duration={0.6}>
                <div
                  className="group relative glass-card rounded-3xl card-padding glass-hover transition-all duration-500 hover:-translate-y-2 hover:shadow-xl h-full flex flex-col border border-transparent hover:border-white/10 overflow-hidden"
                  style={{ ['--accent-color' as string]: colors.accentBorder }}
                >
                  {/* Colored Top Accent Border */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: colors.gradient }}
                  />

                  {/* Glass Shine Effect on Hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden rounded-2xl">
                    <div
                      className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transform -skew-x-12 group-hover:animate-shine"
                      style={{ animationDuration: '1.5s' }}
                    />
                  </div>

                  {/* Icon - Larger with hover animation */}
                  <div
                    className="w-16 h-16 md:w-18 md:h-18 rounded-xl flex items-center justify-center content-spacing shadow-lg group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500"
                    style={{ background: colors.gradient }}
                  >
                    <Icon className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-md" />
                  </div>

                  {/* Content */}
                  <h3
                    className="content-spacing-sm text-h4 font-bold transition-all duration-300 group-hover:bg-clip-text group-hover:text-transparent"
                    style={{
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                      backgroundImage: colors.hoverGradient,
                      backgroundSize: '200% auto',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                    }}
                  >
                    <span className="group-hover:opacity-0 transition-opacity duration-300 absolute">
                      {service.title}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {service.title}
                    </span>
                  </h3>
                  <p className="text-sm md:text-base text-foreground/70 content-spacing group-hover:text-foreground/80 transition-colors duration-300">
                    {service.description}
                  </p>

                  {/* Features - Visually Distinct Box */}
                  <div className="flex-grow">
                    <div
                      className="rounded-xl p-4 border border-border/30 group-hover:border-white/10 transition-colors duration-300"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%)',
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      <ul className="space-y-5">
                        {service.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-4 group/item">
                            <div
                              className={`
                                relative flex items-center justify-center flex-shrink-0 mt-1
                                w-6 h-6 rounded-full
                                shadow-lg ${service.shadowColor}
                                transition-all duration-300
                                group-hover/item:scale-110 group-hover/item:shadow-xl ${service.hoverShadow}
                              `}
                              style={{ background: colors.gradient }}
                            >
                              <Check
                                className="w-4 h-4 text-white drop-shadow-lg"
                                strokeWidth={2.5}
                              />
                              <div
                                className={`absolute inset-0 rounded-full bg-white/20 blur-md opacity-0 group-hover/item:opacity-100 transition-opacity duration-300`}
                              />
                            </div>
                            <span className="text-sm md:text-base text-foreground/90 font-medium leading-6 md:leading-7 group-hover/item:text-foreground transition-colors duration-300">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {service.pricing && (
                    <div className="mt-4">
                      <div
                        className="rounded-xl p-4 border-2 transition-all duration-300 group-hover:border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${colors.glowColor}, transparent)`,
                          borderColor: colors.accentBorder + '40',
                        }}
                      >
                        {/* CTA Button */}
                        <a
                          href={service.href}
                          className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-white transition-all duration-300 hover:scale-105 hover:shadow-lg group/cta"
                          style={{ background: colors.gradient }}
                        >
                          <span>{service.pricing.cta}</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollAnimation>
            );
})}
          </div>
        </div>
      </div>

      {/* CSS for shine animation */}
      <style>{`
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(-12deg); }
          100% { transform: translateX(200%) skewX(-12deg); }
        }
        .group:hover .group-hover\\:animate-shine {
          animation: shine 1.5s ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse, .group-hover\\:animate-shine {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

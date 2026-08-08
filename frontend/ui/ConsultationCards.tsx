import {
  Microphone,
  CheckCircle,
  Clock,
  Sparkle,
  WhatsappLogo,
  ArrowLeft,
} from '@phosphor-icons/react/ssr';
import { Button } from './primitives/button';
import { ScrollAnimation } from './ScrollAnimations';

export function ConsultationCards() {
  return (
    <section
      id="consultation"
      dir="rtl"
      className="relative overflow-hidden py-20 sm:py-28 md:py-36 bg-slate-950 text-slate-100 selection:bg-purple-500/30 selection:text-purple-200"
      aria-label="الاستشارة التقنية الشاملة"
    >
      {/* Dynamic Grid Overlay & Mesh Ambient Lighting */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-size-[3.5rem_3.5rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"
        aria-hidden="true"
      />

      {/* Layered Multi-Color Radial Ambient Glows */}
      <div
        className="absolute top-1/4 right-1/4 w-[min(400px,85vw)] sm:w-[min(650px,85vw)] h-[min(400px,85vw)] sm:h-[min(650px,85vw)] rounded-full pointer-events-none blur-[120px] sm:blur-[160px] opacity-40 animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.22) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-10 left-1/4 w-[min(350px,80vw)] sm:w-[min(550px,80vw)] h-[min(350px,80vw)] sm:h-[min(550px,80vw)] rounded-full pointer-events-none blur-[100px] sm:blur-[140px] opacity-35"
        style={{
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(500px,95vw)] sm:w-[min(900px,95vw)] h-[min(250px,80vw)] sm:h-[min(450px,80vw)] rounded-full pointer-events-none blur-[140px] sm:blur-[180px] opacity-30"
        style={{
          background: 'radial-gradient(ellipse, rgba(124, 58, 237, 0.15) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center mb-12 sm:mb-16 md:mb-20">
            {/* Top Eyebrow Micro-Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs sm:text-sm font-medium mb-5 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.15)]">
              <Sparkle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>جلسات تخصُّصيَّة</span>
            </div>

            {/* Main H2 Title */}
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-white">
              <span className="bg-linear-to-r from-purple-300 via-purple-100 to-indigo-300 bg-clip-text text-transparent">
                الاستشارات
              </span>
            </h2>

            {/* Subtitle */}
            <p className="text-base sm:text-lg lg:text-xl text-slate-300/90 leading-relaxed sm:leading-8 max-w-2xl mx-auto font-normal">
              نختصر عليك سنوات من البحث ونمنحك الخلاصة التِّقنيَّة والعمليَّة بصدق وأمانة.
            </p>
          </div>
        </ScrollAnimation>

        {/* Main Consultation Card */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="relative group">
            {/* Dynamic Glow Halo on Hover */}
            <div
              className="absolute -inset-1 rounded-3xl bg-linear-to-r from-purple-600/30 via-violet-600/20 to-indigo-600/30 opacity-70 blur-xl group-hover:opacity-100 transition duration-700 ease-out pointer-events-none"
              aria-hidden="true"
            />

            {/* Glassmorphic Container Card */}
            <div className="relative rounded-3xl overflow-hidden bg-linear-to-b from-purple-950/40 via-slate-950/80 to-slate-950/95 backdrop-blur-2xl border border-purple-500/30 shadow-[0_25px_50px_-12px_rgba(124,58,237,0.25),0_0_80px_-20px_rgba(168,85,247,0.2),inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all duration-500 hover:border-purple-400/50">
              {/* Vibrant Accent Top Strip */}
              <div className="h-1 w-full bg-linear-to-r from-transparent via-purple-500 to-transparent opacity-80" />

              {/* Internal Card Canvas */}
              <div className="p-6 sm:p-8 md:p-10 lg:p-12">
                {/* Header Row: Pricing & Interactive Pill Badge */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 pb-8 border-b border-purple-500/15">
                  {/* Price Typography */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-linear-to-l from-purple-200 via-white to-purple-400 tracking-tight">
                      $25
                    </span>
                    <span className="text-slate-400 text-base sm:text-lg font-medium pr-1">
                      / للسَّاعة
                    </span>
                  </div>

                  {/* Microphone Feature Badge */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-purple-500/15 border border-purple-400/30 backdrop-blur-md self-start sm:self-auto shadow-inner shadow-purple-500/10">
                    <Microphone className="w-4 h-4 text-purple-300 animate-pulse shrink-0" />
                    <span className="text-xs sm:text-sm text-purple-200 font-semibold tracking-wide">
                      جلسة تفاعليَّة صوتيَّة
                    </span>
                  </div>
                </div>

                {/* Title and Description Content */}
                <div className="mb-8 space-y-3">
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                    توجيه تقني متكامل
                  </h3>
                  <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
                    تحليل كامل لاحتياجاتك الرَّقميَّة. نُراجع ما لديك، ونرسم لك مسار التَّعليم أو
                    التَّنفيذ خطوة بخطوة. استشارة تمنحك الوضوح التَّام.
                  </p>
                </div>

                {/* Feature Value Highlights Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10 text-slate-200 text-sm sm:text-base">
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/10 backdrop-blur-xs">
                    <CheckCircle className="w-5 h-5 text-purple-400 shrink-0" />
                    <span className="font-medium">جلسة صوتيَّة مباشرة (1:1)</span>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/10 backdrop-blur-xs">
                    <Clock className="w-5 h-5 text-purple-400 shrink-0" />
                    <span className="font-medium">توقيت مرن يُناسب جدولك</span>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/10 backdrop-blur-xs">
                    <Sparkle className="w-5 h-5 text-purple-400 shrink-0" />
                    <span className="font-medium">خطَّة عمل وإرشاد مُخصَّص</span>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/10 backdrop-blur-xs">
                    <WhatsappLogo className="w-5 h-5 text-purple-400 shrink-0" />
                    <span className="font-medium">تأكيد وحجز سريع عبر واتساب</span>
                  </div>
                </div>

                {/* Action CTA Container */}
                <div className="space-y-4">
                  <a
                    href="https://wa.me/963968478904?text=%D8%A7%D9%84%D8%B3%D9%91%D9%8E%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D9%81%D9%8A%20%D8%AD%D8%AC%D8%B2%20%D8%A7%D8%B3%D8%AA%D8%B4%D8%A7%D8%B1%D8%A9."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group/btn rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-label="احجز استشارتك الآن"
                  >
                    <Button className="w-full h-14 sm:h-16 text-lg sm:text-xl font-bold text-white rounded-full bg-linear-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:via-indigo-500 hover:to-purple-500 transition-all duration-300 ease-out hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] shadow-xl shadow-purple-900/40 cursor-pointer border border-purple-400/30 active:scale-[0.98] flex items-center justify-center gap-3 min-h-11">
                      <span>احجز استشارتك الآن</span>
                      <ArrowLeft className="w-5 h-5 text-purple-200 group-hover/btn:-translate-x-1.5 transition-transform duration-300 shrink-0" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>

            {/* Floating Soft Ambient Glow Background Orbs */}
            <div
              className="absolute -top-6 -right-6 w-28 h-28 rounded-full blur-3xl pointer-events-none -z-10"
              style={{ background: 'rgba(139, 92, 246, 0.35)' }}
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-6 -left-6 w-36 h-36 rounded-full blur-3xl pointer-events-none -z-10"
              style={{ background: 'rgba(168, 85, 247, 0.25)' }}
              aria-hidden="true"
            />
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

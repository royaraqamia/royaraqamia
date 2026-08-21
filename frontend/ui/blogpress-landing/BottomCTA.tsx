import { BottomCTA as SharedBottomCTA } from '@/frontend/ui/landing-shared/BottomCTA';

export function BottomCTA() {
  return (
    <SharedBottomCTA
      appPath="/blogpress/app"
      loginRedirect="/blogpress/app"
      sectionClassName="relative overflow-hidden py-20 sm:py-28 lg:py-36 border-t border-border/40 bg-background transition-colors duration-500"
      sectionAria={{ label: 'Call to Action' }}
      decor={
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-150 h-80 sm:h-150 bg-primary/10 rounded-full glow-blur-md sm:glow-blur-xl pointer-events-none -z-10 opacity-70" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
        </>
      }
      containerClassName="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"
      card={{
        className:
          'relative rounded-3xl border border-border/60 bg-card/40 backdrop-blur-xl p-8 sm:p-12 md:p-16 lg:p-20 shadow-2xl shadow-primary/5 overflow-hidden text-center group/card',
        innerDecor: (
          <div className="absolute -inset-px rounded-3xl bg-linear-to-b from-primary/20 via-border/30 to-transparent opacity-60 pointer-events-none -z-10" />
        ),
      }}
      contentMotion={{ initialY: 30, viewportMargin: '-80px', duration: 0.8 }}
      contentClassName="flex flex-col items-center"
      badgeMotionClassName="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs sm:text-sm font-medium tracking-wide shadow-xs backdrop-blur-md mb-6 sm:mb-8 hover:bg-primary/15 hover:border-primary/40 transition-all duration-300 select-none cursor-default"
      badgeText="ابدأ النَّشر اليوم"
      badgeSparkleClassName="text-primary shrink-0 animate-pulse"
      headingClassName="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.12] mb-6 sm:mb-8 text-foreground text-balance"
      headingPrefix="هل أنت مستعد لمشاركة "
      headingHighlight="صوتك؟"
      headingHighlightClassName="gradient-text bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent drop-shadow-xs"
      subtitle="انضم إلى المبدعين الذين يثقون في منتجنا للكتابة والنَّشر وتنمية جمهورهم بأدوات Markdown قويَّه وتحسين محرِّكات البحث."
      subtitleClassName="text-base sm:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed sm:leading-loose text-balance"
      actionsClassName="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5"
      actionsMotion={{ initialY: 20, duration: 0.6, useEase: false }}
      primaryButtonClassName="group relative inline-flex items-center justify-center gap-3 h-14 sm:h-16 px-8 sm:px-10 rounded-full bg-primary text-primary-foreground font-semibold text-base sm:text-lg shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 border border-primary/30 cursor-pointer"
      primaryButtonSpanClassName="relative z-10"
      arrowClassName="relative z-10 group-hover:-translate-x-1.5 transition-transform duration-300 shrink-0"
      secondaryButtonClassName="inline-flex items-center justify-center h-14 sm:h-16 px-8 sm:px-10 rounded-full border border-border/80 bg-background/60 backdrop-blur-md hover:bg-accent/80 hover:border-accent hover:text-accent-foreground text-foreground font-semibold text-base sm:text-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer"
    />
  );
}

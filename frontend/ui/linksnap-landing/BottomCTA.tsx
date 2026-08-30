import { BottomCTA as SharedBottomCTA } from '@/frontend/ui/landing-shared/BottomCTA';

export function BottomCTA() {
  return (
    <SharedBottomCTA
      appPath="/linksnap/app"
      loginRedirect="/linksnap/app"
      sectionClassName="relative overflow-hidden border-t border-border/40 bg-background/65"
      sectionAria={{ labelledby: 'cta-heading' }}
      decor={
        <>
          {/* Top ambient highlight boundary line */}
          <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />

          {/* Atmospheric mesh grid & dynamic radial lighting */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-137.5 md:w-175 h-80 sm:h-137.5 md:h-175 bg-primary/14 rounded-full glow-blur-md sm:glow-blur-lg pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-50 sm:w-87.5 h-50 sm:h-87.5 bg-primary/25 rounded-full glow-blur-sm pointer-events-none" />
        </>
      }
      containerClassName="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 md:py-36 text-center"
      contentMotion={{ initialY: 30, viewportMargin: '-80px', duration: 0.8 }}
      contentClassName="flex flex-col items-center"
      headingId="cta-heading"
      headingClassName="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.1] mb-6 text-foreground text-balance max-w-4xl"
      headingPrefix="هل أنت مستعد "
      headingHighlight="لتتبُّع كل نقرة؟"
      headingHighlightClassName="bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent gradient-text"
      subtitle="انضم إلى آلاف مديري الرَّوابط الأذكياء. اختصِر، تتبَّع، وحسِّن روابطك باستخدام منصَّة التَّحليلات القويَّة من رؤية رقمية."
      subtitleClassName="text-base sm:text-lg md:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed font-normal text-balance"
      actionsClassName="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4"
      actionsMotion={{ initialY: 20, duration: 0.6, useEase: true }}
      primaryButtonClassName="cta-glow group relative inline-flex items-center justify-center gap-2.5 text-base sm:text-lg font-bold px-8 sm:px-12 h-14 sm:h-16 rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20 hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      arrowClassName="arrow-bounce transition-transform duration-300 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 shrink-0"
      secondaryButtonClassName="group inline-flex items-center justify-center text-base sm:text-lg font-medium h-14 sm:h-16 px-8 sm:px-10 rounded-full border border-border/80 bg-background/75 hover:bg-accent/88 hover:border-border transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
}

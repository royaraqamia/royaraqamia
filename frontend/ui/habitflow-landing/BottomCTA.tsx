import { BottomCTA as SharedBottomCTA } from '@/frontend/ui/landing-shared/BottomCTA';

export function BottomCTA() {
  return (
    <SharedBottomCTA
      appPath="/habitflow/app"
      loginRedirect="/habitflow/app"
      sectionClassName="relative w-full overflow-hidden border-t border-border/40 bg-background py-20 sm:py-28 lg:py-36"
      decor={
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none overflow-hidden select-none"
        >
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-150 sm:w-200 lg:w-250 h-125 bg-linear-to-b from-primary/15 via-primary/5 to-transparent rounded-full blur-3xl opacity-80" />
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-100 sm:w-150 h-75 bg-primary/14 rounded-full blur-3xl opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[24px_24px] opacity-30 mask-[radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        </div>
      }
      containerClassName="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"
      card={{
        className:
          'relative rounded-3xl border border-border/60 bg-card/55 p-8 sm:p-14 lg:p-20 text-center shadow-2xl shadow-primary/5 ring-1 ring-white/10 overflow-hidden',
        innerDecor: (
          <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
        ),
      }}
      contentMotion={{ initialY: 24, viewportMargin: '-60px', duration: 0.7 }}
      contentClassName=""
      headingClassName="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.15] text-foreground max-w-3xl mx-auto text-balance"
      headingPrefix="هل أنت مستعد لبناء "
      headingHighlight="عادات أفضل؟"
      headingHighlightClassName="bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent drop-shadow-xs"
      subtitle="انضم إلى آلاف الأشخاص الذين يستخدمون منتجنا لتتبُّع روتينهم اليومي، وبناء السَّلاسل، وتغيير حياتهم يومًا بعد يوم."
      subtitleClassName="mt-5 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed text-balance font-normal"
      actionsClassName="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
      actionsMotion={{ initialY: 16, duration: 0.5, useEase: false }}
      primaryButtonClassName="group relative text-base sm:text-lg font-semibold px-8 sm:px-10 h-14 sm:h-16 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      arrowClassName="transition-transform duration-300 group-hover:-translate-x-1.5"
      secondaryButtonClassName="text-base sm:text-lg font-medium h-14 sm:h-16 px-8 sm:px-10 rounded-full border-border/80 hover:bg-accent/88 hover:text-accent-foreground transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

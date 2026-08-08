export function PageLoader() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="جاري تحميل المحتوى"
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#050505] font-sans antialiased selection:bg-violet-500/30 selection:text-violet-200"
    >
      {/* Ambient Deep-Space Radial Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center mix-blend-screen"
      >
        <div className="absolute h-120 w-120 rounded-full bg-linear-to-tr from-violet-600/10 via-purple-900/10 to-transparent blur-[80px] transform-gpu sm:h-200 sm:w-200 sm:blur-[120px]" />
        <div className="absolute h-60 w-60 rounded-full bg-indigo-500/10 blur-[60px] transform-gpu sm:h-100 sm:w-100 sm:blur-[100px]" />
      </div>

      {/* Premium Interactive Glassmorphic Card */}
      <div className="group relative z-10 mx-auto flex w-[calc(100%-2rem)] max-w-[320px] flex-col items-center justify-center overflow-hidden rounded-[2.5rem] border border-white/6 bg-white/2 p-8 shadow-[0_24px_48px_-12px_rgba(0,0,0,1)] backdrop-blur-3xl ring-1 ring-white/2 ring-inset transition-all duration-700 ease-out hover:border-white/12 hover:bg-white/3 hover:shadow-[0_32px_64px_-16px_rgba(139,92,246,0.15)] sm:max-w-95 sm:p-12">
        {/* Top-Edge 3D Highlight Overlay */}
        <div className="absolute inset-x-0 top-0 h-px w-full bg-linear-to-r from-transparent via-white/20 to-transparent opacity-40 transition-opacity duration-700 group-hover:opacity-70" />

        {/* High-Precision Kinetic Spinner Assembly */}
        <div className="relative mb-10 flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
          {/* Reactive Core Ambient Aura */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-violet-500/15 blur-xl transition-all duration-700 ease-out group-hover:bg-violet-500/25 group-hover:blur-2xl"
          />

          {/* Faint Outer Structural Track */}
          <div className="absolute inset-0 rounded-full border border-white/5 transition-colors duration-700 group-hover:border-white/10" />

          {/* Primary Forward-Spinning Gradient Arc */}
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-violet-400 border-t-violet-500/80" />

          {/* Secondary Counter-Spinning Inner Arc */}
          <div className="absolute inset-2 animate-[spin_2s_linear_infinite_reverse] rounded-full border border-transparent border-b-purple-400/60 border-l-purple-500/30 sm:inset-3" />

          {/* Breathing Power Node */}
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-300 shadow-[0_0_16px_4px_rgba(167,139,250,0.5)] transition-all duration-700 group-hover:scale-125 group-hover:bg-white group-hover:shadow-[0_0_20px_6px_rgba(167,139,250,0.7)] sm:h-3 sm:w-3" />
        </div>

        {/* Semantic Typographic Hierarchy */}
        <div className="flex w-full flex-col items-center space-y-5 text-center">
          {/* Micro-Interaction Status Badge */}
          <div className="flex items-center gap-2.5 rounded-full border border-violet-500/20 bg-violet-500/5 px-3.5 py-1.5 shadow-[inset_0_0_12px_rgba(139,92,246,0.05)] transition-colors duration-500 group-hover:border-violet-500/30 group-hover:bg-violet-500/10">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500 transition-colors duration-500 group-hover:bg-violet-400" />
            </span>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.25em] text-violet-300/80 transition-colors duration-500 group-hover:text-violet-300 sm:text-xs">
              جاري التَّهيئة
            </span>
          </div>

          {/* Primary Action Feedback */}
          <h1 className="text-sm font-medium tracking-wide text-neutral-300 transition-colors duration-500 group-hover:text-white sm:text-base">
            جاري تحميل المحتوى...
          </h1>
        </div>

        {/* Minimalist Linear Shimmer Bar */}
        <div className="mt-8 h-0.5 w-full max-w-30 overflow-hidden rounded-full bg-white/5 shadow-inner">
          <div className="h-full w-full animate-pulse bg-linear-to-r from-transparent via-violet-400/80 to-transparent transition-opacity duration-500 group-hover:via-violet-400" />
        </div>

        {/* Screen Reader Boundary Integrity */}
        <span className="sr-only">جاري تحميل المحتوى، يُرجَى الانتظار...</span>
      </div>
    </main>
  );
}

export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="جارٍ تحميل محتوى الصَّفحة"
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-neutral-950 p-4 font-sans antialiased selection:bg-violet-500/30 selection:text-violet-200"
    >
      {/* Ambient Radial Background Glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-87.5 w-87.5 sm:h-125 sm:w-125 rounded-full bg-linear-to-tr from-violet-600/15 via-purple-600/10 to-indigo-500/15 blur-[120px] transform-gpu" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-45 w-45 rounded-full bg-violet-500/10 blur-[70px] transform-gpu" />
      </div>

      {/* Glassmorphic Loader Container */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-6 rounded-3xl border border-white/10 bg-neutral-900/60 p-8 sm:p-10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all duration-500 hover:border-white/15 max-w-xs sm:max-w-sm w-full mx-auto">
        {/* Multi-Ring Multi-Layer Spinner */}
        <div className="relative flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20">
          {/* Outer Ambient Glow Ring */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-linear-to-tr from-violet-500 to-indigo-500 blur-md opacity-30 animate-pulse"
          />

          {/* Base Track */}
          <div className="absolute inset-0 rounded-full border-2 border-white/5" />

          {/* Rotating Gradient Arc */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 border-r-purple-400 animate-spin" />

          {/* Secondary Outer Pulse Boundary */}
          <div className="absolute -inset-1.5 rounded-full border border-violet-500/20 animate-pulse" />

          {/* Glowing Center Core Node */}
          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)] animate-pulse" />
        </div>

        {/* Status Messaging & Typography */}
        <div className="flex flex-col items-center text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium uppercase tracking-widest text-violet-300 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 shadow-inner">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-ping" />
            جارٍ التَّهيئة
          </span>

          <h1 className="text-sm sm:text-base font-medium text-neutral-200 tracking-tight">
            جارٍ تحميل تجربتك...
          </h1>
        </div>

        {/* Shimmer Accent Bar */}
        <div className="w-full max-w-35 sm:max-w-40 h-1 bg-neutral-800/80 rounded-full overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent via-violet-400 to-transparent rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-75" />
        </div>

        {/* Accessibility Screen Reader Notice */}
        <span className="sr-only">جارٍ تحميل المحتوى، يُرجَى الانتظار...</span>
      </div>
    </main>
  );
}

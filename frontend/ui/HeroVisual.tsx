'use client';

import { Zap, TrendingUp, ChartColumn, Users, Sparkle } from 'lucide-react';

export function HeroVisual() {
  return (
    <div
      role="region"
      aria-label="معاينة لوحة التحكم التحليلية التفاعلية"
      className="relative w-full max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto select-none p-2 sm:p-4"
    >
      {/* Floating icon - Top Right (Lightning bolt) */}
      <div className=" absolute -top-4 -right-2 sm:-top-6 sm:-right-4 lg:top-2 lg:right-2 z-30 w-12 h-12 lg:w-16 lg:h-16">
        <div className="relative w-full h-full rounded-2xl bg-linear-to-br from-violet-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl border border-white/20 transition-transform hover:scale-105 duration-300">
          <Zap
            className="w-6 h-6 lg:w-8 lg:h-8 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
            fill="currentColor"
          />
        </div>
      </div>

      {/* Main Dashboard mockup */}
      <div className="relative bg-neutral-950/95 rounded-3xl border border-white/10 z-10 overflow-hidden shadow-[0_32px_96px_-16px_rgba(0,0,0,0.8),0_0_1px_1px_rgba(255,255,255,0.05)] group/dashboard">
        {/* Glossy sheen overlay */}
        <div className="absolute inset-0 bg-linear-to-tr from-white/2 via-white/8 to-transparent pointer-events-none transition-opacity duration-500 group-hover/dashboard:opacity-100 opacity-60" />

        {/* Top edge crisp border highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        <div className="p-4 sm:p-6 lg:p-7 space-y-5">
          {/* Top bar - Window Header Controls & Metrics section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block shadow-xs" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block shadow-xs" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block shadow-xs" />
              </div>
              <div className="h-3.5 w-px bg-white/10 mx-1.5" />
              <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="h-2 w-14 rounded-full bg-linear-to-r from-white/25 to-white/10" />
              </div>
            </div>

            {/* Skeletal header line previews */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="h-2 bg-linear-to-r from-white/15 to-white/5 rounded-full w-24 sm:w-32" />
              <div className="h-2 bg-white/5 rounded-full w-12" />
            </div>
          </div>

          {/* Main Content Cards grid */}
          <div className="space-y-4">
            {/* Top row - Two large visual metrics blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Top-left card - Analytics Chart */}
              <div className="bg-white/3 hover:bg-white/6 rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-white/15 transition-safe duration-300 aspect-4/3 sm:aspect-square flex flex-col justify-between relative overflow-hidden group/card shadow-inner">
                {/* Header info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shadow-xs">
                      <TrendingUp className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-20 rounded-full bg-white/20" />
                      <div className="h-1.5 w-24 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <span className="h-3.5 w-10 rounded-md bg-purple-500/15 border border-purple-500/20" />
                </div>

                {/* Animated Bar Chart */}
                <div className="flex-1 flex items-end justify-between gap-1.5 pt-6 pb-1">
                  {[60, 85, 45, 95, 70, 55, 80].map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center h-full justify-end group/bar"
                    >
                      <div
                        className="w-full max-w-4.5 rounded-t-md bg-linear-to-t from-purple-600/80 via-violet-500/60 to-purple-400/90 relative shadow-[0_0_12px_rgba(168,85,247,0.2)] group-hover/bar:brightness-125 transition-safe"
                        style={{ height: `${v}%` }}
                      >
                        {/* Light cap indicator */}
                        <div className="absolute top-0 inset-x-0 h-0.5 bg-white/60 rounded-t-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top-right card - Users Line Chart */}
              <div className="bg-white/3 hover:bg-white/6 rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-white/15 transition-safe duration-300 aspect-4/3 sm:aspect-square flex flex-col justify-between relative overflow-hidden group/card shadow-inner">
                {/* Header info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shadow-xs">
                      <Users className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-24 rounded-full bg-white/20" />
                      <div className="h-1.5 w-20 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <span className="h-3.5 w-10 rounded-md bg-violet-500/15 border border-violet-500/20" />
                </div>

                {/* SVG Line Chart with Area Fill */}
                <div className="flex-1 relative flex items-center justify-center py-2">
                  <svg
                    className="w-full h-24 overflow-visible"
                    viewBox="0 0 100 40"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="gradientLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#C084FC" />
                        <stop offset="50%" stopColor="#A855F7" />
                        <stop offset="100%" stopColor="#7C3AED" />
                      </linearGradient>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#A855F7" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Gradient Fill under line */}
                    <path
                      d="M0,40 C20,40 20,10 50,25 C80,40 80,0 100,20 L100,40 L0,40 Z"
                      fill="url(#areaGradient)"
                    />

                    {/* Main Curved Line */}
                    <path
                      d="M0,40 C20,40 20,10 50,25 C80,40 80,0 100,20"
                      fill="none"
                      stroke="url(#gradientLine)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Interactive animated focal point */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_15px_rgba(168,85,247,1)] border-2 border-purple-500" />
                </div>
              </div>
            </div>

            {/* Bottom row - Four KPI micro modules */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                {
                  icon: ChartColumn,
                  color: 'text-purple-400',
                  bg: 'bg-purple-500/15',
                  border: 'border-purple-500/20',
                  progress: 75,
                },
                {
                  icon: Sparkle,
                  color: 'text-violet-400',
                  bg: 'bg-violet-500/15',
                  border: 'border-violet-500/20',
                  progress: 90,
                },
                {
                  icon: TrendingUp,
                  color: 'text-indigo-400',
                  bg: 'bg-indigo-500/15',
                  border: 'border-indigo-500/20',
                  progress: 60,
                },
                {
                  icon: Zap,
                  color: 'text-fuchsia-400',
                  bg: 'bg-fuchsia-500/15',
                  border: 'border-fuchsia-500/20',
                  progress: 85,
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/3 hover:bg-white/[0.07] rounded-xl p-3 border border-white/5 hover:border-white/15 transition-safe duration-300 flex flex-col justify-between gap-2.5 group/kpi"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-7 h-7 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center transition-transform group-hover/kpi:scale-110 duration-300`}
                    >
                      <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                    </div>
                    <span className="h-2.5 w-10 rounded-full bg-white/20" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-1.5 w-12 rounded-full bg-white/10" />
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.bg.replace('/15', '/80')} rounded-full`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating indicator - Bottom Left */}
      <div className=" absolute -bottom-4 -left-2 sm:-bottom-5 sm:-left-4 lg:bottom-2 lg:left-2 z-30 w-14 h-14 lg:w-18 lg:h-18">
        <div className="relative w-full h-full rounded-full bg-linear-to-br from-indigo-500 via-purple-600 to-accent flex items-center justify-center shadow-2xl border border-white/20 transition-transform hover:scale-105 duration-300">
          <div className="w-1/2 h-1/2 border-2 border-white/80 rounded-full flex items-center justify-center shadow-inner">
            <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,1)] animate-ping" />
          </div>
        </div>
      </div>
    </div>
  );
}

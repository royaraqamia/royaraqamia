'use client';

import { useState, useEffect } from 'react';
import { m } from 'motion/react';
import { Lightning, TrendUp, ChartBar, Users, Sparkle } from '@phosphor-icons/react';

export function HeroVisual() {
  const [isHoveringDashboard, setIsHoveringDashboard] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkMobile, 150);
    };
    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <div
      className="relative w-full max-w-[500px] lg:max-w-none mx-auto perspective-3d"
      onMouseEnter={() => setIsHoveringDashboard(true)}
      onMouseLeave={() => setIsHoveringDashboard(false)}
    >
      {/* Floating icon - Top Right (Lightning bolt) */}
      <m.div
        className="absolute -top-6 -right-6 lg:top-0 lg:right-0 lg:translate-x-1/2 lg:-translate-y-1/2 w-12 h-12 lg:w-16 lg:h-16 z-30"
        animate={{
          y: [0, -12, 0],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 5, // Slower duration
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Glow - Opacity based animation instead of box-shadow */}
        <div className="absolute inset-0 rounded-xl bg-primary blur-xl opacity-40 animate-pulse" />

        <div className="relative w-full h-full rounded-xl bg-linear-to-br from-primary via-primary to-accent flex items-center justify-center shadow-lg border border-white/20">
          <Lightning className="w-6 h-6 lg:w-8 lg:h-8 text-white drop-shadow-md" weight="fill" />
        </div>
      </m.div>

      {/* Dashboard mockup */}
      <m.div
        className="relative bg-background/40 backdrop-blur-md rounded-3xl border border-white/10 z-10 overflow-hidden"
        animate={
          !isMobile
            ? {
                rotateX: isHoveringDashboard ? 2.5 : 5,
                rotateY: isHoveringDashboard ? -1.5 : -5,
                scale: isHoveringDashboard ? 1.02 : 1,
              }
            : {}
        }
        transition={{
          duration: 0.8,
          ease: 'easeOut',
        }}
        style={{
          transformStyle: 'preserve-3d',
          boxShadow: '0 24px 72px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.1)',
        }}
      >
        {/* Glossy overlay */}
        <div className="absolute inset-0 bg-linear-to-tr from-white/5 to-transparent pointer-events-none" />

        <div className="p-4 lg:p-6 space-y-4">
          {/* Top bar - Header section */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-linear-to-r from-white/10 via-white/20 to-transparent" />
            </div>
            {/* Skeletal lines - Static/Clean */}
            <div className="h-2 bg-white/10 rounded-full w-3/4" />
            <div className="h-1.5 bg-white/5 rounded-full w-1/2" />
          </div>

          {/* Cards grid */}
          <div className="space-y-3">
            {/* Top row - Two large square blocks */}
            <div className="grid grid-cols-2 gap-3">
              {/* Top-left card - Analytics Chart */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5 aspect-square flex flex-col relative overflow-hidden group hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center">
                    <TrendUp className="w-3.5 h-3.5 text-teal-400" weight="duotone" />
                  </div>
                </div>

                {/* Bar chart - animating only on hover or slowly */}
                <div className="flex-1 flex items-end justify-around gap-1.5 pb-2">
                  {[60, 85, 45, 95, 70, 55, 80].map((height, i) => (
                    <m.div
                      key={i}
                      className="w-3 rounded-t-sm bg-linear-to-t from-teal-500/60 to-cyan-400/40"
                      initial={{ height: `${height * 0.7}%` }}
                      animate={
                        isHoveringDashboard
                          ? { height: [`${height * 0.7}%`, `${height}%`, `${height * 0.7}%`] }
                          : { height: `${height * 0.7}%` }
                      }
                      transition={{
                        duration: 2,
                        repeat: isHoveringDashboard ? Infinity : 0,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Top-right card - Users Line Chart */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5 aspect-square flex flex-col relative overflow-hidden group hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-pink-500/20 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-pink-400" />
                  </div>
                </div>

                <div className="flex-1 relative flex items-center">
                  {/* Simplified Line Chart - SVG */}
                  <svg
                    className="w-full h-12 overflow-visible"
                    viewBox="0 0 100 40"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0,40 C20,40 20,10 50,25 C80,40 80,0 100,20"
                      fill="none"
                      stroke="url(#gradientLine)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradientLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#A855F7" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Dot that only moves on hover */}
                  <m.div
                    className="absolute top-1/2 left-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(236,72,153,0.8)]"
                    animate={isHoveringDashboard ? { x: [-20, 20, -20] } : {}}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom row - Four smaller blocks, now responsive grid */}
            <div className="grid grid-cols-4 gap-2 lg:gap-3">
              {[
                { icon: ChartBar, color: 'text-blue-400', bg: 'bg-blue-500/20', progress: 75 },
                { icon: Sparkle, color: 'text-amber-400', bg: 'bg-amber-500/20', progress: 90 },
                { icon: TrendUp, color: 'text-green-400', bg: 'bg-green-500/20', progress: 60 },
                { icon: Lightning, color: 'text-purple-400', bg: 'bg-purple-500/20', progress: 85 },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 rounded-xl p-2 lg:p-3 border border-white/5 flex flex-col items-center justify-center gap-2"
                >
                  <div
                    className={`w-6 h-6 lg:w-8 lg:h-8 rounded-lg ${item.bg} flex items-center justify-center`}
                  >
                    <item.icon className={`w-3 h-3 lg:w-4 lg:h-4 ${item.color}`} />
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <m.div
                      className={`h-full ${item.bg.replace('/20', '/60')}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.progress}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: idx * 0.1 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </m.div>

      {/* Floating indicator - Bottom Left */}
      <m.div
        className="absolute -bottom-5 -left-5 lg:bottom-0 lg:left-0 lg:-translate-x-1/2 lg:translate-y-1/3 w-16 h-16 lg:w-20 lg:h-20 z-30"
        animate={{
          y: [0, -10, 0],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      >
        <div className="absolute inset-0 rounded-full bg-primary blur-xl opacity-30 animate-pulse" />
        <div className="relative w-full h-full rounded-full bg-linear-to-br from-primary via-primary to-accent flex items-center justify-center shadow-xl border border-white/20">
          <div className="w-1/2 h-1/2 border-time border-2 border-white/80 rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_white]" />
          </div>
        </div>
      </m.div>
    </div>
  );
}

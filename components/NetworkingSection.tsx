import { Button } from './ui/button';
import { Briefcase, UserCircle } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';

export function NetworkingSection() {
  return (
    <section id="networking" className="relative py-16 md:py-24 overflow-hidden">
      {/* Background with Premium Gradients & Noise */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0">
        <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-orange-500/10 rounded-full blur-[80px] md:blur-[100px] -translate-y-1/2 translate-x-1/4 animate-pulse-slow" />
        <div className="absolute bottom-0 left-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-purple-500/10 rounded-full blur-[80px] md:blur-[100px] translate-y-1/3 -translate-x-1/4 animate-pulse-slow delay-1000" />
        {/* CSS-based noise pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Title & Subtitle - Centered at Top */}
        <div className="text-center mb-12 md:mb-16">
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
            style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
          >
            <span className="text-orange-400">التَّشبيك</span>
          </h2>
          <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
            نربطك مع أصحاب المهارات أو أصحاب الأعمال المناسبين لاحتياجاتك ورغباتك.
          </p>
        </div>

        {/* CTA Card */}
        <ScrollAnimation animation="fade-in" duration={0.7}>
          <div className="relative w-full max-w-md mx-auto lg:max-w-none">
            {/* Premium Glass Card with Animated Border */}
            <div className="relative p-[1px] rounded-3xl overflow-hidden group">
              {/* Animated Gradient Border - Faster & Electric */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/30 to-purple-500/30 opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-[spin_2s_linear_infinite]" />
              <div className="absolute inset-[1px] bg-[#1a1f2e] rounded-3xl z-0" />

              <div className="relative z-10 p-6 md:p-8 lg:p-10 rounded-3xl bg-white/5 backdrop-blur-xl h-full flex flex-col gap-6 md:gap-8">
                <div className="text-center">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                    انضم إلى شبكتنا
                  </h3>
                  <p className="text-slate-400 text-sm">
                    وسنتواصل معك عند توفُّر التَّطابق المناسب
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Business Button */}
                  <Button
                    size="lg"
                    onClick={() => window.open('https://forms.gle/xJgLajFeZz1SZSB28', '_blank')}
                    // Updated: Base bg is subtle orange tint, Border stays orange with idle pulse
                    className="group/btn relative w-full h-auto py-4 md:py-5 px-4 md:px-6 bg-orange-950/20 border animate-border-pulse-orange hover:border-orange-500/40 hover:bg-orange-950/30 rounded-xl flex items-center justify-between transition-all duration-300 hover:translate-x-[-4px] active:scale-[0.98] overflow-hidden"
                  >
                    {/* Gradient overlay - Orange only */}
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />

                    {/* Idle Shimmer - Auto plays on mobile, pauses on hover */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer-slide group-hover/btn:[animation-play-state:paused]" />

                    {/* Hover Crystal Sheen Effect */}
                    <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-[150%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />

                    <div className="flex items-center gap-4 md:gap-4 overflow-hidden relative z-10">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover/btn:scale-110 group-hover/btn:shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-all duration-300 flex-shrink-0">
                        <Briefcase className="w-5 h-5 md:w-6 md:h-6 -rotate-6 group-hover/btn:rotate-0 transition-transform duration-300" />
                      </div>
                      <div className="text-right min-w-0">
                        <div className="text-white font-bold text-base md:text-lg truncate">
                          انضم كصاحب عمل <span className="text-orange-400">(25$ لكل عمليَّة مطابقة)</span>
                        </div>
                        <div className="text-slate-400 text-xs font-normal truncate">
                          ابحث عن كفاءات ومشاريع
                        </div>
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover/btn:border-orange-500/50 transition-colors flex-shrink-0 relative z-10">
                      <span className="text-slate-400 group-hover/btn:text-orange-400 text-lg group-hover/btn:-translate-x-1 transition-transform">
                        ←
                      </span>
                    </div>
                  </Button>

                  {/* Specialist Button */}
                  <Button
                    size="lg"
                    onClick={() => window.open('https://forms.gle/fADDH6jsr5swEXYW8', '_blank')}
                    // Updated: Base bg is subtle purple tint, Border stays purple with idle pulse
                    className="group/btn relative w-full h-auto py-4 md:py-5 px-4 md:px-6 bg-purple-950/20 border animate-border-pulse-purple hover:border-purple-500/40 hover:bg-purple-950/30 rounded-xl flex items-center justify-between transition-all duration-300 hover:translate-x-[-4px] active:scale-[0.98] overflow-hidden"
                  >
                    {/* Gradient overlay - Purple only */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-violet-500/5 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />

                    {/* Idle Shimmer - Auto plays on mobile, pauses on hover */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer-slide group-hover/btn:[animation-play-state:paused]" />

                    {/* Hover Crystal Sheen Effect */}
                    <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-[150%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />

                    <div className="flex items-center gap-4 md:gap-4 overflow-hidden relative z-10">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover/btn:scale-110 group-hover/btn:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all duration-300 flex-shrink-0">
                        <UserCircle className="w-5 h-5 md:w-6 md:h-6 group-hover/btn:scale-110 group-hover/btn:animate-pulse transition-transform duration-300" />
                      </div>
                      <div className="text-right min-w-0">
<div className="text-white font-bold text-base md:text-lg truncate">
                          انضم كخبير متخصِّص <span className="text-orange-400">(مجَّانًا)</span>
                        </div>
                        <div className="text-slate-400 text-xs font-normal truncate">
                          اعرض خدماتك وخبراتك
                        </div>
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover/btn:border-purple-500/50 transition-colors flex-shrink-0 relative z-10">
                      <span className="text-slate-400 group-hover/btn:text-purple-400 text-lg group-hover/btn:-translate-x-1 transition-transform">
                        ←
                      </span>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}

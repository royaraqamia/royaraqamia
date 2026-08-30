'use client';

import { m, useReducedMotion } from 'motion/react';
import { CheckSquare, Plus, Sparkles } from 'lucide-react';
import { HABIT_TEMPLATES, type HabitTemplate } from '@/frontend/shared/habitflow/habit-templates';
import { Button } from '@/frontend/ui/primitives/button';

interface HabitOnboardingProps {
  onTemplateSelect: (template: HabitTemplate) => void;
  onCreateBlank: () => void;
}

export function HabitOnboarding({ onTemplateSelect, onCreateBlank }: HabitOnboardingProps) {
  const reduce = useReducedMotion();

  return (
    <section
      aria-labelledby="habit-onboarding-title"
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-6 sm:p-8 md:p-10 shadow-2xl backdrop-blur-2xl ring-1 ring-foreground/10 max-w-5xl mx-auto"
    >
      {/* Ambient background glow spotlight */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"
        aria-hidden="true"
      />

      <div className="relative z-10">
        {/* Header Section */}
        <header className="text-center space-y-3 mb-8 sm:mb-10">
          <div className="inline-flex items-center">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 shadow-xs backdrop-blur-md">
              <Sparkles
                className="w-3.5 h-3.5 shrink-0 text-primary animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
              ابدأ بسرعة
            </span>
          </div>

          <h2
            id="habit-onboarding-title"
            className="text-xl sm:text-2xl md:text-3xl font-extrabold text-foreground"
          >
            اختر عادة روتينيَّة
          </h2>

          <p className="text-xs sm:text-sm text-muted-foreground/90 leading-relaxed max-w-md mx-auto text-pretty">
            قوالب جاهزة لبدء رحلتك في أقلِّ من خطوتين، أو أنشِئ عادتك من الصِّفر
          </p>
        </header>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
          {HABIT_TEMPLATES.map((template) => {
            return (
              <m.button
                key={template.name}
                type="button"
                whileHover={reduce ? undefined : { y: -4, scale: 1.01 }}
                whileTap={reduce ? undefined : { scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onTemplateSelect(template)}
                aria-label={`ابدأ عادة ${template.name} (${template.description})`}
                className={`group relative flex flex-col items-center justify-between text-center min-h-42.5 sm:min-h-47.5 rounded-2xl border p-4 sm:p-5 transition-all duration-300 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  reduce ? '' : 'will-change-transform'
                } border-border/60 bg-background/60 hover:bg-background/95 hover:border-primary/40 shadow-xs hover:shadow-xl hover:shadow-primary/5`}
              >
                {/* Subtle internal gradient overlay on card hover */}
                <div
                  className="absolute inset-0 rounded-2xl bg-linear-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  aria-hidden="true"
                />

                <div className="space-y-1 my-auto w-full text-center z-10">
                  <span className="block text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors duration-200 line-clamp-1">
                    {template.name}
                  </span>
                  <span className="block text-[11px] sm:text-xs text-muted-foreground/80 leading-snug line-clamp-2 text-pretty">
                    {template.description}
                  </span>
                </div>

                <div className="pt-2 z-10">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-muted-foreground group-hover:text-primary bg-muted/60 group-hover:bg-primary/10 border border-border/40 group-hover:border-primary/20 transition-all duration-200">
                    {template.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
                  </span>
                </div>
              </m.button>
            );
          })}
        </div>

        {/* Footer Actions & Local Notice */}
        <footer className="mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Button
            type="button"
            onClick={onCreateBlank}
            variant="outline"
            className="w-full sm:w-auto h-11 rounded-xl px-6 text-xs sm:text-sm font-bold border-border/80 hover:border-primary/40 hover:bg-muted/80 transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer inline-flex items-center justify-center gap-2 group"
          >
            <Plus
              className="w-4 h-4 text-primary group-hover:rotate-90 transition-transform duration-300"
              aria-hidden="true"
            />
            <span>إنشاء عادة مُخصَّصة</span>
          </Button>

          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground/90 bg-muted/30 border border-border/30 rounded-xl px-3.5 py-2 backdrop-blur-xs">
            <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span>ستظلُّ سجلاتك محفوظة محلِّيًّا حتَّى تُسجِّل دخولك</span>
          </div>
        </footer>
      </div>
    </section>
  );
}

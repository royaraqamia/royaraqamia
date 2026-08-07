'use client';

import { createElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckSquare, Plus, Sparkles } from 'lucide-react';
import { HABIT_TEMPLATES, type HabitTemplate } from '@/frontend/shared/habitflow/habit-templates';
import { getIconComponent, getIconColorClass } from '@/frontend/shared/habitflow/habit-icons';
import { Button } from '@/frontend/ui/primitives/button';

interface HabitOnboardingProps {
  onTemplateSelect: (template: HabitTemplate) => void;
  onCreateBlank: () => void;
}

export function HabitOnboarding({ onTemplateSelect, onCreateBlank }: HabitOnboardingProps) {
  const reduce = useReducedMotion();

  return (
    <div className="rounded-3xl border border-border/60 bg-linear-to-b from-card/90 via-card/60 to-card/30 p-5 sm:p-8 shadow-xs backdrop-blur-xl ring-1 ring-foreground/5">
      <div className="text-center space-y-2 mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
          ابدأ بسرعة
        </span>
        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
          اختر عادة روتينيَّة
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto text-balance">
          قوالب جاهزة لبدء رحلتك في أقل من خطوتين، أو أنشئ عادتك من الصفر
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {HABIT_TEMPLATES.map((template) => {
          const Icon = getIconComponent(template.icon);
          const colorClass = getIconColorClass(template.icon);
          return (
            <motion.button
              key={template.name}
              type="button"
              whileHover={reduce ? undefined : { y: -3, scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={() => onTemplateSelect(template)}
              aria-label={`ابدأ عادة ${template.name} (${template.description})`}
              className={`group flex flex-col items-center text-center gap-1.5 rounded-2xl border p-3.5 sm:p-4 transition-colors duration-200 ease-out cursor-pointer touch-target focus-ring ${
                reduce ? '' : 'will-change-transform'
              } border-border/60 bg-background/70 hover:border-primary/40 hover:bg-background shadow-xs hover:shadow-md`}
            >
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${colorClass}`}
              >
                {createElement(Icon, { className: 'w-5 h-5', 'aria-hidden': true })}
              </div>
              <div className="space-y-0.5 text-center">
                <span className="block text-xs font-bold text-foreground whitespace-nowrap">
                  {template.name}
                </span>
                <span className="block text-[10px] text-muted-foreground leading-snug">
                  {template.description}
                </span>
                <span className="block text-[9px] font-semibold text-primary/70 uppercase tracking-wider">
                  {template.frequency === 'daily' ? 'يومي' : 'أسبوعي'}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          type="button"
          onClick={onCreateBlank}
          variant="outline"
          className="w-full sm:w-auto rounded-xl px-5 py-2.5 text-xs font-medium border-border/60 hover:bg-muted/80 transition-all duration-200 h-auto touch-target btn-press"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          إنشاء عادة مخصصة
        </Button>
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
          <CheckSquare className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          ستظل سجلاتك محفوظة محليًّا حتى تسجّل دخولك
        </span>
      </div>
    </div>
  );
}

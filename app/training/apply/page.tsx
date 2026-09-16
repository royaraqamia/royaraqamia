import { Clock, GraduationCap, MessageCircle, Trophy, User } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { TrainingApplicationForm } from '@/frontend/ui/training/training-application-form';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import { TRAINING_COURSE } from '@/shared/contracts/training';

const SUMMARY_ITEMS = [
  { icon: User, label: 'المدرِّب', value: TRAINING_COURSE.trainer },
  { icon: Clock, label: 'المدَّة الكلِّيَّة', value: TRAINING_COURSE.duration },
  { icon: Trophy, label: 'عدد الجلسات', value: TRAINING_COURSE.sessions },
];

export default function TrainingApplyPage() {
  if (!TRAINING_COURSE.isOpen) {
    return (
      <div className="rounded-3xl border border-border/60 bg-muted/30 p-8 sm:p-12 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <GraduationCap className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">
          التَّقديم متوقِّف حاليًّا
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
          باب التَّقديم على هذه الدَّورة مغلق مؤقّتًا. راسلنا عبر واتساب لتعرف موعد الدُّفعة
          القادمة.
        </p>
        <Button
          asChild
          className="h-13 rounded-full px-8 mt-7 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-xl shadow-purple-600/20 flex items-center justify-center gap-3 cursor-pointer border-0"
        >
          <a
            href={getWhatsAppUrl('السَّلام عليكم، أرغب بمعرفة موعد الدُّفعة القادمة من التَّدريب.')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>اسأل عبر واتساب</span>
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Course summary — same source as the homepage card, so copy cannot drift. */}
      <section
        aria-label="تفاصيل الدورة"
        className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
      >
        <h2 className="text-lg sm:text-xl font-extrabold text-foreground">
          {TRAINING_COURSE.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {TRAINING_COURSE.description}
        </p>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SUMMARY_ITEMS.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-bold text-foreground">{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex items-baseline gap-2 border-t border-border/50 pt-5">
          <span className="text-xs font-medium text-muted-foreground">رسوم الاستثمار</span>
          <span className="text-2xl font-black tracking-tight text-foreground">
            {TRAINING_COURSE.price}
          </span>
          <span className="text-xs text-muted-foreground">للدَّورة كاملة</span>
        </div>
      </section>

      <section
        aria-label="نموذج التقديم"
        className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm"
      >
        <TrainingApplicationForm />
      </section>
    </div>
  );
}

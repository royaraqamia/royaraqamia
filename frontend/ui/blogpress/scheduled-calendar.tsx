'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m, useReducedMotion } from 'motion/react';
import { ChevronRight, ChevronLeft, CalendarDays, FileText, Move, Pencil } from 'lucide-react';
import type { Post } from '@/shared/contracts/blogpress';
import { cn } from '@/frontend/shared/cn';
import { schedulePost } from '@/frontend/api/blogpress';
import { toast } from 'sonner';

interface ScheduledCalendarProps {
  scheduled: Post[];
  drafts?: Post[];
  withReorder?: boolean;
}

const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function isoDayKey(iso?: string | null): string {
  if (!iso) return '';
  return dayKey(new Date(iso));
}

export function ScheduledCalendar({
  scheduled,
  drafts = [],
  withReorder = false,
}: ScheduledCalendarProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [cursor, setCursor] = useState(() => new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of [...scheduled, ...drafts]) {
      const key = isoDayKey(post.publish_at);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(post);
      map.set(key, arr);
    }
    return map;
  }, [scheduled, drafts]);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: Date[] = [];
    for (let d = 1 - startWeekday; d <= daysInMonth; d++) {
      arr.push(new Date(year, month, d));
    }
    return arr;
  }, [year, month]);

  const todayKey = dayKey(new Date());

  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  const reschedule = async (postId: string, target: Date) => {
    setBusy(true);
    try {
      await schedulePost(postId, target.toISOString());
      router.refresh();
      toast.success('تمت إعادة الجدولة');
    } catch {
      toast.error('فشلت إعادة جدولة المقال');
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (postId: string, targetKey: string) => {
    if (!withReorder || busy || !postId) return;
    const [y, m, d] = targetKey.split('-').map(Number);
    if (!y || !m || !d) return;
    const source = scheduled.find((p) => p.id === postId);
    const hours = source?.publish_at ? new Date(source.publish_at).getHours() : 12;
    const target = new Date(y, m - 1, d, hours, 0, 0, 0);
    void reschedule(postId, target);
    setDraggingId(null);
    setOverKey(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="الشهر السابق"
            className="size-9 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="الشهر التالي"
            className="size-9 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-foreground">
          {cursor.toLocaleDateString('ar-SA-u-nu-latn', { month: 'long', year: 'numeric' })}
        </h2>

        {withReorder ? (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Move className="size-4 text-primary" />
            اسحب لتغيير الموعد
          </span>
        ) : (
          <span className="text-xs font-bold text-muted-foreground">&nbsp;</span>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 select-none"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = dayKey(date);
            const posts = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const inMonth = date.getMonth() === month;

            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (!withReorder || busy) return;
                  e.preventDefault();
                  setOverKey(key);
                }}
                onDragLeave={() => setOverKey((v) => (v === key ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(draggingId ?? '', key);
                }}
                className={cn(
                  'relative min-h-24 border-b border-l border-border/40 p-1.5 transition-colors',
                  !inMonth && 'bg-muted/40',
                  isToday && 'bg-primary/[0.04]',
                  overKey === key && 'ring-2 ring-primary/40 ring-inset bg-primary/5'
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center size-6 text-xs font-bold rounded-md',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {inMonth ? date.getDate() : ''}
                </span>

                <div className="mt-1 space-y-1">
                  {posts.map((post) => {
                    const isDragging = draggingId === post.id;
                    return (
                      <m.div
                        key={post.id}
                        draggable={withReorder && !busy}
                        onDragStart={() => setDraggingId(post.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setOverKey(null);
                        }}
                        variants={{
                          hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
                          visible: { opacity: 1, y: 0 },
                        }}
                        initial="hidden"
                        animate={isDragging ? 'hidden' : 'visible'}
                        className={cn(
                          'group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-grab active:cursor-grabbing select-none',
                          post.status === 'scheduled'
                            ? 'bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-300'
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300',
                          isDragging && 'opacity-40'
                        )}
                        title={post.title || 'بدون عنوان'}
                      >
                        <FileText className="size-3 shrink-0 opacity-70" />
                        <Link
                          href={`/blogpress/editor/${post.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-[11px] font-medium min-w-0 flex-1 hover:underline"
                        >
                          {post.title || 'بدون عنوان'}
                        </Link>
                        <Pencil className="size-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                      </m.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scheduled.length === 0 && drafts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
            <CalendarDays className="size-6" />
          </div>
          <p className="text-sm font-bold text-foreground">لا توجد مقالات مجدولة</p>
          <p className="text-xs text-muted-foreground mt-1">
            حدّد موعد نشر لمقال من محرر BlogPress ليظهر هنا في التقويم.
          </p>
        </div>
      )}
    </div>
  );
}

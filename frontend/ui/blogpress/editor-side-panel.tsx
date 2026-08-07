'use client';

import { useMemo, useState } from 'react';
import {
  Search,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Globe,
  X,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { SITE_URL } from '@/frontend/shared/constants';
import type { ContentStats } from '@/frontend/shared/blogpress/content-stats';

interface EditorSidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  slug: string;
  metaTitle: string;
  setMetaTitle: (value: string) => void;
  metaDesc: string;
  setMetaDesc: (value: string) => void;
  stats: ContentStats;
}

type PanelTab = 'seo' | 'stats';

function CounterBadge({
  label,
  value,
  optimal,
  warning,
  over,
}: {
  label: string;
  value: number;
  optimal: boolean;
  warning: boolean;
  over: boolean;
}) {
  const status = over ? 'over' : warning ? 'warning' : optimal ? 'optimal' : 'empty';
  const statusText =
    status === 'over'
      ? 'تمَّ الوصول للحدِّ الأقصى'
      : status === 'warning'
        ? 'يقترب من الحد'
        : status === 'optimal'
          ? 'ممتاز'
          : null;

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        {status === 'over' || status === 'warning' ? (
          <AlertTriangle
            className={`size-3 ${status === 'over' ? 'text-rose-500' : 'text-amber-500'}`}
          />
        ) : status === 'optimal' ? (
          <CheckCircle2 className="size-3 text-emerald-500" />
        ) : null}
        <span className="font-medium text-muted-foreground">{label}</span>
        {statusText && (
          <span
            className={`font-medium ${
              status === 'over'
                ? 'text-rose-600 dark:text-rose-400'
                : status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {statusText}
          </span>
        )}
      </div>
      <span
        className={`font-mono text-[11px] ${
          status === 'over'
            ? 'font-bold text-rose-600 dark:text-rose-400'
            : 'text-muted-foreground/70'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SeoCheck({
  passed,
  optional,
  label,
  hint,
}: {
  passed: boolean;
  optional?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {passed ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : optional ? (
        <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <p
          className={`text-xs leading-relaxed ${
            passed
              ? 'text-foreground'
              : optional
                ? 'text-muted-foreground/60'
                : 'text-foreground/80'
          }`}
        >
          {label}
          {optional && <span className="text-xs text-muted-foreground/50 ms-1">(اختياري)</span>}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export function EditorSidePanel({
  open,
  onClose,
  title,
  slug,
  metaTitle,
  setMetaTitle,
  metaDesc,
  setMetaDesc,
  stats,
}: EditorSidePanelProps) {
  const [tab, setTab] = useState<PanelTab>('seo');

  const siteHost = useMemo(() => {
    try {
      return new URL(SITE_URL).host;
    } catch {
      return SITE_URL || 'example.com';
    }
  }, []);

  const metaTitleLength = metaTitle.length;
  const metaDescLength = metaDesc.length;
  const words = stats.words;
  const imagesMissingAlt = stats.imagesMissingAlt;
  const readingTime = stats.readingTimeMinutes;
  const readability = stats.readability;

  const readabilityColor =
    readability.label === 'ممتازة'
      ? 'bg-emerald-500'
      : readability.label === 'جيدة'
        ? 'bg-amber-500'
        : 'bg-rose-500';
  const readabilityTextColor =
    readability.label === 'ممتازة'
      ? 'text-emerald-600 dark:text-emerald-400'
      : readability.label === 'جيدة'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="لوحة جانبيَّة للمُحرِّر"
      className="flex w-full max-w-sm shrink-0 flex-col border-e border-border/60 bg-background/80 backdrop-blur-sm md:w-80"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 rounded-lg px-2.5 text-xs font-semibold transition-smooth ${
              tab === 'seo'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('seo')}
          >
            <Search className="size-3.5 me-1" />
            SEO
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 rounded-lg px-2.5 text-xs font-semibold transition-smooth ${
              tab === 'stats'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('stats')}
          >
            <BarChart3 className="size-3.5 me-1" />
            الإحصاءات
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="إغلاق اللوحة الجانبيَّة"
          className="text-muted-foreground hover:text-foreground transition-smooth shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar">
        {tab === 'seo' ? (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Search className="size-3.5" />
                </div>
                <span>تحسين محرِّكات البحث (SEO)</span>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="side-meta-title"
                  className="text-xs font-medium text-muted-foreground"
                >
                  عنوان SEO
                </Label>
                <Input
                  id="side-meta-title"
                  name="meta_title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={title || 'عنوان SEO مُخصَّص'}
                  maxLength={70}
                  className="text-sm min-h-10 rounded-xl bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
                />
                <CounterBadge
                  label="الحرف"
                  value={metaTitleLength}
                  optimal={metaTitleLength > 0 && metaTitleLength <= 60}
                  warning={metaTitleLength > 60 && metaTitleLength < 70}
                  over={metaTitleLength >= 70}
                />
                <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      metaTitleLength >= 70
                        ? 'bg-rose-500'
                        : metaTitleLength > 60
                          ? 'bg-amber-500'
                          : metaTitleLength > 0
                            ? 'bg-emerald-500'
                            : 'bg-muted'
                    }`}
                    style={{ width: `${Math.min(100, (metaTitleLength / 70) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="side-meta-desc"
                  className="text-xs font-medium text-muted-foreground"
                >
                  وصف SEO
                </Label>
                <Textarea
                  id="side-meta-desc"
                  name="meta_desc"
                  value={metaDesc}
                  onChange={(e) => setMetaDesc(e.target.value)}
                  placeholder="وصف مختصر يظهر في نتائج البحث"
                  maxLength={160}
                  rows={3}
                  className="text-sm resize-none min-h-20 rounded-xl bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary leading-relaxed"
                />
                <CounterBadge
                  label="الحرف"
                  value={metaDescLength}
                  optimal={metaDescLength > 0 && metaDescLength <= 140}
                  warning={metaDescLength > 140 && metaDescLength < 160}
                  over={metaDescLength >= 160}
                />
                <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      metaDescLength >= 160
                        ? 'bg-rose-500'
                        : metaDescLength > 140
                          ? 'bg-amber-500'
                          : metaDescLength > 0
                            ? 'bg-emerald-500'
                            : 'bg-muted'
                    }`}
                    style={{ width: `${Math.min(100, (metaDescLength / 160) * 100)}%` }}
                  />
                </div>
              </div>

              {(metaTitle || metaDesc) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Eye className="size-3.5 text-primary" />
                    <span>معاينة في نتائج البحث (Google)</span>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background p-3.5 space-y-2 shadow-xs">
                    <div
                      className="flex items-center gap-2 text-xs text-muted-foreground/80 font-sans"
                      dir="ltr"
                    >
                      <div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground shrink-0 border border-border/40">
                        G
                      </div>
                      <div className="flex items-center gap-1 truncate text-xs">
                        <span className="text-foreground/90 font-medium">{siteHost}</span>
                        <span className="text-muted-foreground/50">› blog ›</span>
                        <span className="text-muted-foreground/80 truncate">{slug || '...'}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer leading-snug truncate">
                      {metaTitle || title || 'عنوان المقال'}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {metaDesc || 'وصف تلقائي سيظهر هنا بناءً على محتوى المقال...'}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2.5 rounded-2xl border border-border/50 bg-card/50 p-3.5">
              <p className="text-xs font-semibold text-foreground">قائمة تحسين المحتوى</p>
              <SeoCheck passed={metaTitleLength > 0} label="عنوان SEO مكتوب" />
              <SeoCheck
                passed={metaDescLength > 0}
                label="وصف SEO مكتوب"
                optional
                hint="يُستخدَم وصف تلقائي إذا تُرك فارغًا"
              />
              <SeoCheck passed={words > 50} label="أكثر من 50 كلمة" hint={`${words} كلمة حالياً`} />
              <SeoCheck
                passed={imagesMissingAlt === 0}
                label="كل الصُّور لها نص بديل (Alt)"
                optional
                hint={imagesMissingAlt > 0 ? `${imagesMissingAlt} صورة بدون نص بديل` : undefined}
              />
              <SeoCheck
                passed={slug.length > 0 && !slug.startsWith('post-')}
                label="رابط URL مخصَّص"
                optional
              />
            </section>
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-border/50 bg-card/50 p-3.5 space-y-1">
              <p className="text-xs font-semibold text-foreground mb-1">المحتوى</p>
              <StatsRow label="الكلمات" value={words.toLocaleString('ar-u-nu-latn')} />
              <StatsRow
                label="الأحرف (بدون مسافات)"
                value={stats.characters.toLocaleString('ar-u-nu-latn')}
              />
              <StatsRow label="وقت القراءة" value={readingTime} />
              <StatsRow label="الجمل" value={stats.sentences} />
            </section>

            <section className="rounded-2xl border border-border/50 bg-card/50 p-3.5 space-y-1">
              <p className="text-xs font-semibold text-foreground mb-1">العناوين</p>
              <StatsRow label="العناوين (إجمالي)" value={stats.headingCount} />
              <StatsRow label="عنوان 1 (H1)" value={stats.headings.h1} />
              <StatsRow label="عنوان 2 (H2)" value={stats.headings.h2} />
              <StatsRow label="عنوان 3 (H3)" value={stats.headings.h3} />
              <StatsRow label="الفواصل (Paragraphs)" value={stats.paragraphs} />
            </section>

            <section className="rounded-2xl border border-border/50 bg-card/50 p-3.5 space-y-1">
              <p className="text-xs font-semibold text-foreground mb-1">الوسائط والروابط</p>
              <StatsRow label="الصُّور" value={stats.images} />
              <StatsRow label="صُور بدون نص بديل" value={stats.imagesMissingAlt} />
              <StatsRow label="الروابط" value={stats.links} />
              <StatsRow label="كتل الكود" value={stats.codeBlocks} />
            </section>

            <section className="rounded-2xl border border-border/50 bg-card/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">سهولة القراءة</p>
                <span className={`text-xs font-bold ${readabilityTextColor}`}>
                  {readability.label}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${readabilityColor}`}
                  style={{ width: `${readability.score}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                درجة {readability.score}/100 — كلَّما زادت الجمل قصرًا، زادت سهولة القراءة.
              </p>
            </section>

            <p className="text-[11px] text-muted-foreground/50 leading-relaxed flex items-start gap-1.5">
              <Globe className="mt-0.5 size-3 shrink-0" />
              تُحسب الإحصاءات مباشرة من محتوى المقال أثناء الكتابة.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

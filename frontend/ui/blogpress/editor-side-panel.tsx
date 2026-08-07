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
  FileText,
  Heading as HeadingIcon,
  Image as ImageIcon,
  Sparkles,
  Tags as TagsIcon,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { SITE_URL } from '@/frontend/shared/constants';
import type { ContentStats } from '@/frontend/shared/blogpress/content-stats';
import type { PostTag } from '@/shared/contracts/blogpress';
import { TagPicker } from '@/frontend/ui/blogpress/tag-picker';

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
  availableTags: PostTag[];
  selectedTags: PostTag[];
  onToggleTag: (tag: PostTag) => void;
  onCreateTag: (name: string, slug: string) => Promise<PostTag | null>;
}

type PanelTab = 'seo' | 'stats' | 'tags';

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
      <div className="flex items-center gap-1.5">
        {status === 'over' || status === 'warning' ? (
          <AlertTriangle
            className={`size-3.5 shrink-0 ${
              status === 'over' ? 'text-rose-500' : 'text-amber-500'
            }`}
          />
        ) : status === 'optimal' ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        ) : null}
        <span className="font-medium text-muted-foreground">{label}</span>
        {statusText && (
          <span
            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
              status === 'over'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                : status === 'warning'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {statusText}
          </span>
        )}
      </div>
      <span
        className={`font-mono text-xs tabular-nums px-2 py-0.5 rounded-md border font-semibold ${
          status === 'over'
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
            : 'bg-muted/50 text-muted-foreground border-border/40'
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
    <div
      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all duration-200 ${
        passed
          ? 'bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-500/10'
          : optional
            ? 'bg-muted/20 border-border/40'
            : 'bg-amber-500/5 border-amber-500/20 dark:bg-amber-500/10'
      }`}
    >
      <div
        className={`mt-0.5 p-0.5 rounded-md shrink-0 ${
          passed ? 'text-emerald-500' : optional ? 'text-muted-foreground/40' : 'text-amber-500'
        }`}
      >
        {passed ? (
          <CheckCircle2 className="size-4" />
        ) : optional ? (
          <XCircle className="size-4" />
        ) : (
          <AlertTriangle className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-medium leading-snug ${
            passed
              ? 'text-foreground'
              : optional
                ? 'text-muted-foreground/70'
                : 'text-foreground/90'
          }`}
        >
          {label}
          {optional && (
            <span className="text-[11px] font-normal text-muted-foreground/60 ms-1.5">
              (اختياري)
            </span>
          )}
        </p>
        {hint && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{hint}</p>
        )}
      </div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted/40 transition-colors duration-150">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="font-mono text-xs font-semibold text-foreground tabular-nums bg-background/80 dark:bg-neutral-800/80 px-2 py-0.5 rounded-md border border-border/40 shadow-xs">
        {value}
      </span>
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
  availableTags,
  selectedTags,
  onToggleTag,
  onCreateTag,
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
  const readabilityBadgeBg =
    readability.label === 'ممتازة'
      ? 'bg-emerald-500/10 border-emerald-500/20'
      : readability.label === 'جيدة'
        ? 'bg-amber-500/10 border-amber-500/20'
        : 'bg-rose-500/10 border-rose-500/20';

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="لوحة جانبيَّة للمُحرِّر"
      className="flex w-full max-w-sm shrink-0 flex-col border-e border-border/60 bg-background/85 backdrop-blur-xl md:w-80 transition-all duration-300 shadow-2xl z-30"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3.5 py-2.5 bg-background/40 backdrop-blur-md">
        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 border border-border/40 backdrop-blur-xs w-full max-w-57.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`flex-1 h-7.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              tab === 'seo'
                ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            onClick={() => setTab('seo')}
          >
            <Search className="size-3.5 me-1.5 shrink-0" />
            SEO
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`flex-1 h-7.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              tab === 'stats'
                ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            onClick={() => setTab('stats')}
          >
            <BarChart3 className="size-3.5 me-1.5 shrink-0" />
            الإحصاءات
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`flex-1 h-7.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              tab === 'tags'
                ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            onClick={() => setTab('tags')}
          >
            <TagsIcon className="size-3.5 me-1.5 shrink-0" />
            الوسوم
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="إغلاق اللوحة الجانبيَّة"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-xl transition-all duration-200 shrink-0 border border-transparent hover:border-border/40 focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar">
        {tab === 'seo' ? (
          <>
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 pb-1 border-b border-border/30">
                <div className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                  <Search className="size-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-foreground tracking-tight">
                    تحسين محرِّكات البحث (SEO)
                  </h3>
                  <p className="text-[11px] text-muted-foreground/70">
                    تحسين ظهور المقال في نتائج البحث
                  </p>
                </div>
              </div>

              {/* Meta Title Field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="side-meta-title"
                  className="text-xs font-semibold text-foreground/90 flex items-center justify-between"
                >
                  <span>عنوان SEO</span>
                </Label>
                <Input
                  id="side-meta-title"
                  name="meta_title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={title || 'عنوان SEO مُخصَّص'}
                  maxLength={70}
                  className="text-xs min-h-9 rounded-xl bg-background border-border/70 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200 shadow-xs placeholder:text-muted-foreground/50"
                />
                <CounterBadge
                  label="الحرف"
                  value={metaTitleLength}
                  optimal={metaTitleLength > 0 && metaTitleLength <= 60}
                  warning={metaTitleLength > 60 && metaTitleLength < 70}
                  over={metaTitleLength >= 70}
                />
                <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden p-0.5 ring-1 ring-border/20">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      metaTitleLength >= 70
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                        : metaTitleLength > 60
                          ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : metaTitleLength > 0
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : 'bg-muted'
                    }`}
                    style={{ width: `${Math.min(100, (metaTitleLength / 70) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Meta Description Field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="side-meta-desc"
                  className="text-xs font-semibold text-foreground/90 flex items-center justify-between"
                >
                  <span>وصف SEO</span>
                </Label>
                <Textarea
                  id="side-meta-desc"
                  name="meta_desc"
                  value={metaDesc}
                  onChange={(e) => setMetaDesc(e.target.value)}
                  placeholder="وصف مُختصَر يظهر في نتائج البحث"
                  maxLength={160}
                  rows={3}
                  className="text-xs resize-none min-h-20 rounded-xl bg-background border-border/70 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200 shadow-xs leading-relaxed placeholder:text-muted-foreground/50"
                />
                <CounterBadge
                  label="الحرف"
                  value={metaDescLength}
                  optimal={metaDescLength > 0 && metaDescLength <= 140}
                  warning={metaDescLength > 140 && metaDescLength < 160}
                  over={metaDescLength >= 160}
                />
                <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden p-0.5 ring-1 ring-border/20">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      metaDescLength >= 160
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                        : metaDescLength > 140
                          ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : metaDescLength > 0
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : 'bg-muted'
                    }`}
                    style={{ width: `${Math.min(100, (metaDescLength / 160) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Google SERP Live Preview Card */}
              {(metaTitle || metaDesc) && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Eye className="size-3.5 text-primary" />
                      <span>معاينة نتائج البحث</span>
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                      Google
                    </span>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-linear-to-b from-card to-muted/20 p-3.5 space-y-2 shadow-xs hover:shadow-sm transition-all duration-200">
                    <div
                      className="flex items-center gap-2 text-xs text-muted-foreground/80 font-sans"
                      dir="ltr"
                    >
                      <div className="size-4.5 rounded-full bg-background flex items-center justify-center text-[10px] font-black text-blue-600 shrink-0 border border-border/60 shadow-xs">
                        G
                      </div>
                      <div className="flex items-center gap-1 truncate text-[11px]">
                        <span className="text-foreground/90 font-medium">{siteHost}</span>
                        <span className="text-muted-foreground/40">›</span>
                        <span className="text-muted-foreground/70">blog</span>
                        <span className="text-muted-foreground/40">›</span>
                        <span className="text-muted-foreground/90 truncate">{slug || '...'}</span>
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

            {/* SEO Quality Checklist */}
            <section className="space-y-2 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-foreground">قائمة تحسين المحتوى</p>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-md border border-border/40">
                  Checklist
                </span>
              </div>
              <div className="space-y-1.5">
                <SeoCheck passed={metaTitleLength > 0} label="عنوان SEO مكتوب" />
                <SeoCheck
                  passed={metaDescLength > 0}
                  label="وصف SEO مكتوب"
                  optional
                  hint="يُستخدَم وصف تلقائي إذا تُرِكَ فارغًا"
                />
                <SeoCheck
                  passed={words > 50}
                  label="أكثر من 50 كلمة"
                  hint={`${words} كلمة حاليًّا`}
                />
                <SeoCheck
                  passed={imagesMissingAlt === 0}
                  label="كل الصُّور لها نص بديل (Alt)"
                  optional
                  hint={imagesMissingAlt > 0 ? `${imagesMissingAlt} صورة بدون نص بديل` : undefined}
                />
                <SeoCheck
                  passed={slug.length > 0 && !slug.startsWith('post-')}
                  label="رابط URL مُخصَّص"
                  optional
                />
              </div>
            </section>
          </>
        ) : tab === 'tags' ? (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2.5 pb-1 border-b border-border/30">
                <div className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                  <TagsIcon className="size-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-foreground tracking-tight">الوسوم</h3>
                  <p className="text-[11px] text-muted-foreground/70">
                    صنِّف المقال لتحسين الوصول والتصفُّح
                  </p>
                </div>
              </div>

              <TagPicker
                availableTags={availableTags}
                selectedTags={selectedTags}
                onToggle={onToggleTag}
                onCreate={onCreateTag}
              />

              <p className="text-[11px] text-muted-foreground/60 leading-relaxed flex items-center gap-1.5 px-1 pt-1">
                <TagsIcon className="size-3 shrink-0 text-muted-foreground/70" />
                <span>تظهر الوسوم في بطاقة المقال وبأسفل كل منشور منشور.</span>
              </p>
            </section>
          </>
        ) : (
          <>
            {/* Content Statistics Card */}
            <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2">
                <FileText className="size-3.5 text-primary" />
                <span>المحتوى والنُّصوص</span>
              </div>
              <div className="space-y-0.5">
                <StatsRow label="الكلمات" value={words.toLocaleString('ar-u-nu-latn')} />
                <StatsRow
                  label="الأحرف (بدون مسافات)"
                  value={stats.characters.toLocaleString('ar-u-nu-latn')}
                />
                <StatsRow label="وقت القراءة المُقدَّر" value={readingTime} />
                <StatsRow label="الجُمَل" value={stats.sentences} />
              </div>
            </section>

            {/* Heading Structure Card */}
            <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2">
                <HeadingIcon className="size-3.5 text-primary" />
                <span>هيكل العناوين والفقرات</span>
              </div>
              <div className="space-y-0.5">
                <StatsRow label="إجمالي العناوين" value={stats.headingCount} />
                <StatsRow label="عنوان رئيسي (H1)" value={stats.headings.h1} />
                <StatsRow label="عنوان فرعي (H2)" value={stats.headings.h2} />
                <StatsRow label="عنوان فرعي ثانٍ (H3)" value={stats.headings.h3} />
                <StatsRow label="الفقرات (Paragraphs)" value={stats.paragraphs} />
              </div>
            </section>

            {/* Media & Links Card */}
            <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2">
                <ImageIcon className="size-3.5 text-primary" />
                <span>الوسائط والرَّوابط</span>
              </div>
              <div className="space-y-0.5">
                <StatsRow label="الصُّور" value={stats.images} />
                <StatsRow label="صور بدون نص بديل" value={stats.imagesMissingAlt} />
                <StatsRow label="الرَّوابط الخارجيَّة والدَّاخليَّة" value={stats.links} />
                <StatsRow label="كتل الكود (Code Blocks)" value={stats.codeBlocks} />
              </div>
            </section>

            {/* Readability Score Card */}
            <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>سهولة القراءة</span>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${readabilityTextColor} ${readabilityBadgeBg}`}
                >
                  {readability.label}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden p-0.5 ring-1 ring-border/20">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out ${readabilityColor}`}
                  style={{ width: `${readability.score}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 leading-relaxed pt-0.5">
                <span>النَّتيجة: {readability.score}/100</span>
                <span>كلَّما قَصُرَت الجمل زادت سهولة القراءة</span>
              </div>
            </section>

            {/* Live Stats Footnote */}
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed flex items-center gap-1.5 px-1">
              <Globe className="size-3 shrink-0 text-muted-foreground/70" />
              <span>تُحسَب الإحصاءات مباشرةً من محتوى المقال أثناء الكتابة.</span>
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

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
  FileText,
  Heading as HeadingIcon,
  Image as ImageIcon,
  Sparkles,
  Tags as TagsIcon,
  Info,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { Dialog, DialogContent } from '@/frontend/ui/primitives/dialog';
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
          ? 'طول مثالي'
          : null;

  return (
    <div className="flex items-center justify-between text-xs pt-1">
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
        <span className="font-medium text-muted-foreground/80">{label}</span>
        {statusText && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-colors ${
              status === 'over'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                : status === 'warning'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
            }`}
          >
            {statusText}
          </span>
        )}
      </div>
      <span
        className={`font-mono text-xs tabular-nums px-2 py-0.5 rounded-md border font-semibold transition-colors ${
          status === 'over'
            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 ring-1 ring-rose-500/20'
            : 'bg-muted/60 text-muted-foreground border-border/50'
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
      className={`group flex items-start gap-3 p-3 rounded-2xl border transition-all duration-200 ${
        passed
          ? 'bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-500/10 hover:border-emerald-500/30'
          : optional
            ? 'bg-muted/30 border-border/40 hover:border-border/70'
            : 'bg-amber-500/5 border-amber-500/20 dark:bg-amber-500/10 hover:border-amber-500/30'
      }`}
    >
      <div
        className={`mt-0.5 p-1 rounded-lg shrink-0 transition-transform duration-200 group-hover:scale-110 ${
          passed
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : optional
              ? 'bg-muted text-muted-foreground/60'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
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
          className={`text-xs font-semibold leading-snug ${
            passed
              ? 'text-foreground'
              : optional
                ? 'text-muted-foreground/80'
                : 'text-foreground/95'
          }`}
        >
          {label}
          {optional && (
            <span className="text-[10px] font-normal text-muted-foreground/70 ms-1.5 bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/30">
              اختياري
            </span>
          )}
        </p>
        {hint && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">{hint}</p>
        )}
      </div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs hover:bg-muted/50 transition-colors duration-150">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="font-mono text-xs font-semibold text-foreground tabular-nums bg-background/90 dark:bg-neutral-800/90 px-2.5 py-0.5 rounded-lg border border-border/50 shadow-xs">
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="sm:max-w-xl w-[calc(100%-1.5rem)] mx-auto p-0 rounded-[28px] border border-border/50 bg-background/95 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.18)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Modal Header & Navigation Bar */}
        <div className="sticky top-0 z-20 flex flex-col border-b border-border/40 bg-background/90 px-6 sm:px-8 pt-6 pb-4 backdrop-blur-xl shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                <span>مساعد تحرير المقال</span>
              </h2>
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                تحسين أداء المقال ومحتواه والوسوم المرتبطة
              </p>
            </div>
          </div>

          <div className="flex items-center p-1 rounded-2xl bg-muted/60 border border-border/40 gap-1 shadow-inner">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`flex-1 h-8 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                tab === 'seo'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10 font-bold'
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
              className={`flex-1 h-8 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                tab === 'stats'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10 font-bold'
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
              className={`flex-1 h-8 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                tab === 'tags'
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10 font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
              onClick={() => setTab('tags')}
            >
              <TagsIcon className="size-3.5 me-1.5 shrink-0" />
              الوسوم
            </Button>
          </div>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="flex-1 overflow-y-auto space-y-6 px-6 sm:px-8 py-6 custom-scrollbar">
          {tab === 'seo' ? (
            <>
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border/30">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                    <Search className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground tracking-tight">
                      تحسين محرِّكات البحث (SEO)
                    </h3>
                    <p className="text-[11px] text-muted-foreground/70">
                      تحسين ظهور وانطباع المقال في نتائج البحث
                    </p>
                  </div>
                </div>

                {/* Meta Title Field */}
                <div className="space-y-2">
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
                    className="text-xs min-h-10 rounded-xl bg-card border-border/70 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200 shadow-xs placeholder:text-muted-foreground/50"
                  />
                  <CounterBadge
                    label="عدد الحروف"
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
                <div className="space-y-2">
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
                    placeholder="وصف مُختصَر يظهر في نتائج البحث..."
                    maxLength={160}
                    rows={3}
                    className="text-xs resize-none min-h-22 rounded-xl bg-card border-border/70 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200 shadow-xs leading-relaxed placeholder:text-muted-foreground/50"
                  />
                  <CounterBadge
                    label="عدد الحروف"
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
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <Eye className="size-3.5 text-primary" />
                        <span>معاينة نتائج البحث</span>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground bg-muted/70 px-2 py-0.5 rounded-md border border-border/40">
                        Google SERP
                      </span>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-linear-to-b from-card via-card to-muted/20 p-4 space-y-2 shadow-xs hover:shadow-md transition-all duration-300">
                      <div
                        className="flex items-center gap-2 text-xs text-muted-foreground/80 font-sans"
                        dir="ltr"
                      >
                        <div className="size-5 rounded-full bg-background flex items-center justify-center text-[10px] font-black text-blue-600 shrink-0 border border-border/60 shadow-xs">
                          G
                        </div>
                        <div className="flex items-center gap-1 truncate text-[11px]">
                          <span className="text-foreground/90 font-medium">{siteHost}</span>
                          <span className="text-muted-foreground/40">›</span>
                          <span className="text-muted-foreground/70">blog</span>
                          <span className="text-muted-foreground/40">›</span>
                          <span className="text-muted-foreground/90 truncate font-mono text-[10px]">
                            {slug || 'post-slug'}
                          </span>
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
              <section className="space-y-2.5 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-foreground">قائمة جودة تحسين المحتوى</p>
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-md border border-border/40">
                    Checklist
                  </span>
                </div>
                <div className="space-y-2">
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
                    hint={
                      imagesMissingAlt > 0 ? `${imagesMissingAlt} صورة بدون نص بديل` : undefined
                    }
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
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border/30">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                    <TagsIcon className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground tracking-tight">
                      إدارة الوسوم
                    </h3>
                    <p className="text-[11px] text-muted-foreground/70">
                      صنِّف المقال لتحسين الوصول والتصفُّح في المدوَّنة
                    </p>
                  </div>
                </div>

                <div className="p-1 rounded-2xl bg-card/40 border border-border/50 shadow-xs">
                  <TagPicker
                    availableTags={availableTags}
                    selectedTags={selectedTags}
                    onToggle={onToggleTag}
                    onCreate={onCreateTag}
                  />
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/30 text-muted-foreground text-[11px] leading-relaxed">
                  <Info className="size-4 shrink-0 text-muted-foreground/70 mt-0.5" />
                  <span>
                    تظهر الوسوم المُختارة في بطاقة المقال، أطراف نتائج البحث، وأسفل المنشور لربط
                    المواضيع المماثلة.
                  </span>
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Content Statistics Card */}
              <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 space-y-2 shadow-xs hover:border-border/80 transition-all duration-200">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <FileText className="size-3.5" />
                  </div>
                  <span>المحتوى والنُّصوص</span>
                </div>
                <div className="space-y-1 pt-1">
                  <StatsRow label="الكلمات" value={words.toLocaleString('ar-u-nu-latn')} />
                  <StatsRow
                    label="الأحرف (بدون مسافات)"
                    value={stats.characters.toLocaleString('ar-u-nu-latn')}
                  />
                  <StatsRow label="وقت القراءة المُقدَّر" value={readingTime} />
                  <StatsRow label="الجُمَل" value={stats.sentences} />
                </div>
              </section>

              {/* Heading Structure Card */}
              <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 space-y-2 shadow-xs hover:border-border/80 transition-all duration-200">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <HeadingIcon className="size-3.5" />
                  </div>
                  <span>هيكل العناوين والفقرات</span>
                </div>
                <div className="space-y-1 pt-1">
                  <StatsRow label="إجمالي العناوين" value={stats.headingCount} />
                  <StatsRow label="عنوان رئيسي (H1)" value={stats.headings.h1} />
                  <StatsRow label="عنوان فرعي (H2)" value={stats.headings.h2} />
                  <StatsRow label="عنوان فرعي ثانٍ (H3)" value={stats.headings.h3} />
                  <StatsRow label="الفقرات (Paragraphs)" value={stats.paragraphs} />
                </div>
              </section>

              {/* Media & Links Card */}
              <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 space-y-2 shadow-xs hover:border-border/80 transition-all duration-200">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <ImageIcon className="size-3.5" />
                  </div>
                  <span>الوسائط والرَّوابط</span>
                </div>
                <div className="space-y-1 pt-1">
                  <StatsRow label="الصُّور" value={stats.images} />
                  <StatsRow label="صور بدون نص بديل" value={stats.imagesMissingAlt} />
                  <StatsRow label="الرَّوابط الخارجيَّة والدَّاخليَّة" value={stats.links} />
                  <StatsRow label="كتل الكود (Code Blocks)" value={stats.codeBlocks} />
                </div>
              </section>

              {/* Readability Score Card */}
              <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 space-y-3 shadow-xs hover:border-border/80 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <Sparkles className="size-3.5" />
                    </div>
                    <span>سهولة القراءة</span>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border shadow-xs ${readabilityTextColor} ${readabilityBadgeBg}`}
                  >
                    {readability.label}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="h-2.5 w-full rounded-full bg-muted/80 overflow-hidden p-0.5 ring-1 ring-border/20">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${readabilityColor}`}
                      style={{ width: `${readability.score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 font-medium pt-0.5">
                    <span>
                      النَّتيجة:{' '}
                      <strong className="text-foreground font-mono">{readability.score}</strong>/100
                    </span>
                    <span>كلَّما قَصُرَت الجمل زادت سهولة القراءة</span>
                  </div>
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
      </DialogContent>
    </Dialog>
  );
}

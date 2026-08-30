'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import {
  Settings,
  Upload,
  Loader2,
  ImageIcon,
  Link2,
  Search,
  X,
  Globe,
  Info,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { SITE_URL } from '@/frontend/shared/constants';

interface PostSettingsDialogProps {
  title: string;
  slug: string;
  onSlugChange: (slug: string) => void;
  coverImage: string;
  setCoverImage: (url: string) => void;
  coverImageError: boolean;
  setCoverImageError: (hasError: boolean) => void;
  isCoverUploading: boolean;
  coverFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleCoverFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  metaTitle: string;
  setMetaTitle: (value: string) => void;
  metaDesc: string;
  setMetaDesc: (value: string) => void;
}

export function PostSettingsDialog({
  title,
  slug,
  onSlugChange,
  coverImage,
  setCoverImage,
  coverImageError,
  setCoverImageError,
  isCoverUploading,
  coverFileInputRef,
  handleCoverFileSelect,
  metaTitle,
  setMetaTitle,
  metaDesc,
  setMetaDesc,
}: PostSettingsDialogProps) {
  const siteHost = useMemo(() => {
    try {
      return new URL(SITE_URL).host;
    } catch {
      return SITE_URL || 'example.com';
    }
  }, []);

  // Title character counter thresholds
  const metaTitleLength = metaTitle.length;
  const isTitleOverLimit = metaTitleLength >= 70;
  const isTitleWarning = metaTitleLength > 60 && metaTitleLength < 70;
  const isTitleOptimal = metaTitleLength > 0 && metaTitleLength <= 60;

  // Description character counter thresholds
  const metaDescLength = metaDesc.length;
  const isDescOverLimit = metaDescLength >= 160;
  const isDescWarning = metaDescLength > 140 && metaDescLength < 160;
  const isDescOptimal = metaDescLength > 0 && metaDescLength <= 140;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground transition-all duration-200 hover:bg-muted/80 rounded-xl active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="إعدادات المقال"
        >
          <Settings className="size-4.5 transition-transform duration-300 ease-out hover:rotate-45" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg md:max-w-xl w-[calc(100%-2rem)] p-0 gap-0 border border-border/60 bg-background/95 shadow-2xl rounded-2xl sm:rounded-3xl">
        {/* Header */}
        <DialogHeader className="relative border-b border-border/40 bg-muted/30 px-5 sm:px-6 py-4.5 sm:py-5 text-right">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs shrink-0">
              <Settings className="size-5 transition-transform duration-500 hover:rotate-90" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                إعدادات المقال
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                تكوين بيانات SEO وخيارات النَّشر والروابط
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Card 1: Permalink / Slug */}
          <section className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-5 space-y-4 shadow-xs hover:border-border/80 transition-all duration-200">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Link2 className="size-4" />
              </div>
              <span>الرَّابط المباشر (Slug)</span>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="slug" className="text-xs font-medium text-muted-foreground">
                رابط URL
              </Label>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                placeholder="رابط-المقال"
                className="font-mono text-sm transition-all duration-200 min-h-11 rounded-xl bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
                dir="ltr"
              />

              {/* URL Preview Card */}
              <div className="rounded-xl border border-border/40 bg-muted/40 p-3 space-y-1.5 transition-colors">
                <div
                  className="flex items-center justify-between text-xs text-muted-foreground/70 font-mono"
                  dir="ltr"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Globe className="size-3.5 text-muted-foreground/50 shrink-0" />
                    <span className="text-muted-foreground/60">{siteHost}/blog/</span>
                    <span className="font-bold text-primary truncate">
                      {slug || <span className="text-muted-foreground/40 italic">رابط-المقال</span>}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                أدخِل رابطًا إنجليزيًّا قصيرًا (مثل: my-first-post)
              </p>
            </div>
          </section>

          {/* Card 2: Cover Image */}
          <section className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-5 space-y-4 shadow-xs hover:border-border/80 transition-all duration-200">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ImageIcon className="size-4" />
              </div>
              <span>صورة الغلاف</span>
            </div>

            <div className="space-y-2">
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverFileSelect}
              />
              {coverImage && !coverImageError ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted group/cover shadow-xs transition-all duration-300 hover:shadow-md">
                  <Image
                    src={coverImage}
                    alt="معاينة صورة الغلاف"
                    fill
                    sizes="(max-width: 640px) 100vw, 560px"
                    unoptimized
                    className="object-cover transition-transform duration-500 group-hover/cover:scale-105"
                    onError={() => setCoverImageError(true)}
                  />
                  <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs opacity-0 group-hover/cover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2.5 p-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-full shadow-lg bg-background/90 hover:bg-background text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
                      disabled={isCoverUploading}
                      onClick={() => coverFileInputRef.current?.click()}
                    >
                      {isCoverUploading ? (
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      تغيير
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
                      onClick={() => {
                        setCoverImage('');
                        setCoverImageError(false);
                      }}
                    >
                      <X className="size-3.5" />
                      إزالة
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverFileInputRef.current?.click()}
                  disabled={isCoverUploading}
                  className="w-full aspect-video rounded-xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-primary/2 dark:hover:bg-primary/4 transition-all duration-300 flex flex-col items-center justify-center p-6 text-center cursor-pointer group/dropzone active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="size-12 rounded-2xl bg-muted/80 dark:bg-muted/40 border border-border/40 flex items-center justify-center mb-3 group-hover/dropzone:scale-110 group-hover/dropzone:border-primary/30 group-hover/dropzone:bg-primary/10 group-hover/dropzone:text-primary transition-all duration-300">
                    {isCoverUploading ? (
                      <Loader2 className="size-6 text-primary animate-spin" />
                    ) : (
                      <ImageIcon className="size-6 text-muted-foreground group-hover/dropzone:text-primary transition-colors" />
                    )}
                  </div>
                  <p className="text-xs font-bold text-foreground group-hover/dropzone:text-primary transition-colors">
                    {isCoverUploading ? 'جارٍ الرَّفع...' : 'انقر لرفع صورة الغلاف'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5 max-w-xs leading-relaxed">
                    PNG أو JPG أو WebP. يُفضَّل أبعاد 1200×630 بكسل.
                  </p>
                </button>
              )}
            </div>
          </section>

          {/* Card 3: SEO Settings */}
          <section className="rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-5 space-y-5 shadow-xs hover:border-border/80 transition-all duration-200">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Search className="size-4" />
              </div>
              <span>تحسين محرِّكات البحث (SEO)</span>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground leading-relaxed">
              <Info className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                هذه البيانات تظهر في نتائج البحث وعند مشاركة المقال على وسائل التَّواصل. إذا تركتها
                فارغة، سيتمُّ استخدام عنوان المقال ووصف تلقائي.
              </span>
            </div>

            {/* Meta Title Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="meta_title" className="text-xs font-medium text-muted-foreground">
                  عنوان SEO
                </Label>
                <div className="flex items-center gap-2 text-xs">
                  {isTitleOptimal && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> ممتاز
                    </span>
                  )}
                  {isTitleWarning && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="size-3" /> يقترب من الحد
                    </span>
                  )}
                  {isTitleOverLimit && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="size-3" /> تمَّ الوصول للحدِّ الأقصى
                    </span>
                  )}
                  <span
                    className={`font-mono text-[11px] transition-colors ${
                      isTitleOverLimit
                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                        : isTitleWarning
                          ? 'text-amber-600 dark:text-amber-400 font-bold'
                          : 'text-muted-foreground/70'
                    }`}
                  >
                    {metaTitleLength}/70
                  </span>
                </div>
              </div>

              <Input
                id="meta_title"
                name="meta_title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || 'عنوان SEO مُخصَّص'}
                maxLength={70}
                className="text-sm transition-all duration-200 min-h-11 rounded-xl bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
              />

              {/* Character Progress Bar */}
              <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isTitleOverLimit
                      ? 'bg-rose-500'
                      : isTitleWarning
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (metaTitleLength / 70) * 100)}%` }}
                />
              </div>
            </div>

            {/* Meta Description Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="meta_desc" className="text-xs font-medium text-muted-foreground">
                  وصف SEO
                </Label>
                <div className="flex items-center gap-2 text-xs">
                  {isDescOptimal && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> ممتاز
                    </span>
                  )}
                  {isDescWarning && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="size-3" /> يقترب من الحد
                    </span>
                  )}
                  {isDescOverLimit && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="size-3" /> تمَّ الوصول للحدِّ الأقصى
                    </span>
                  )}
                  <span
                    className={`font-mono text-[11px] transition-colors ${
                      isDescOverLimit
                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                        : isDescWarning
                          ? 'text-amber-600 dark:text-amber-400 font-bold'
                          : 'text-muted-foreground/70'
                    }`}
                  >
                    {metaDescLength}/160
                  </span>
                </div>
              </div>

              <Textarea
                id="meta_desc"
                name="meta_desc"
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                placeholder="وصف مختصر يظهر في نتائج البحث"
                maxLength={160}
                rows={3}
                className="text-sm transition-all duration-200 resize-none min-h-24 rounded-xl bg-background border-border/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary leading-relaxed"
              />

              {/* Character Progress Bar */}
              <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isDescOverLimit
                      ? 'bg-rose-500'
                      : isDescWarning
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (metaDescLength / 160) * 100)}%` }}
                />
              </div>
            </div>

            {/* Live Google Search Preview Card */}
            {(metaTitle || metaDesc) && (
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Eye className="size-3.5 text-primary" />
                  <span>معاينة في نتائج البحث (Google)</span>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4 space-y-2 shadow-xs transition-all duration-200 hover:border-border">
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

                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer leading-snug truncate">
                    {metaTitle || title || 'عنوان المقال'}
                  </p>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {metaDesc || 'وصف تلقائي سيظهر هنا بناءً على محتوى المقال...'}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

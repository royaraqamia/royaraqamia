'use client';

import Image from 'next/image';
import { Button } from '@/frontend/ui/ui/button';
import { Input } from '@/frontend/ui/ui/input';
import { Label } from '@/frontend/ui/ui/label';
import { Textarea } from '@/frontend/ui/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/ui/dialog';
import { Settings, Upload, Loader2, ImageIcon, Link2, Search, X } from 'lucide-react';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com';

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground transition-smooth"
          aria-label="إعدادات المقال"
        >
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إعدادات المقال</DialogTitle>
          <DialogDescription>تكوين بيانات SEO وخيارات النَّشر</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
              <Link2 className="size-4 text-muted-foreground" />
              الرَّابط
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug" className="text-xs text-muted-foreground">
                رابط URL
              </Label>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                placeholder="رابط-المقال"
                className="transition-smooth min-h-11"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground truncate break-all">
                <span className="text-muted-foreground/60">{new URL(SITE_URL).host}/blog/</span>
                {slug || <span className="text-muted-foreground/40">رابط-المقال</span>}
              </p>
              <p className="text-xs text-muted-foreground/60">
                أدخل رابطاً إنجليزيّاً قصيراً (مثل: my-first-post)
              </p>
            </div>
          </div>

          <div className="h-px bg-border/50" />

          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
              <ImageIcon className="size-4 text-muted-foreground" />
              صورة الغلاف
            </div>
            <div className="grid gap-2">
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverFileSelect}
              />
              {coverImage && !coverImageError ? (
                <div className="relative aspect-video overflow-hidden rounded-lg border border-border/50 bg-muted group">
                  <Image
                    src={coverImage}
                    alt="معاينة صورة الغلاف"
                    fill
                    sizes="(max-width: 640px) 100vw, 448px"
                    unoptimized
                    className="object-cover"
                    onError={() => setCoverImageError(true)}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                      disabled={isCoverUploading}
                      onClick={() => coverFileInputRef.current?.click()}
                    >
                      {isCoverUploading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      تغيير
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
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
                  className="flex flex-col items-center justify-center aspect-video rounded-lg border border-dashed border-border/60 bg-muted/30 hover:bg-muted/50 hover:border-primary/40 transition-smooth text-center cursor-pointer disabled:opacity-50"
                >
                  {isCoverUploading ? (
                    <Loader2 className="size-8 text-muted-foreground/30 mb-2 animate-spin" />
                  ) : (
                    <ImageIcon className="size-8 text-muted-foreground/30 mb-2" />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {isCoverUploading ? 'جارٍ الرَّفع...' : 'انقر لرفع صورة الغلاف'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    PNG أو JPG أو WebP. يُفضَّل أبعاد 1200×630 بكسل.
                  </p>
                </button>
              )}
            </div>
          </div>

          <div className="h-px bg-border/50" />

          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
              <Search className="size-4 text-muted-foreground" />
              تحسين محرِّكات البحث (SEO)
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
              هذه البيانات تظهر في نتائج البحث وعند مشاركة المقال على وسائل التَّواصل. إذا تركتها
              فارغة، سيتمُّ استخدام عنوان المقال ووصف تلقائي.
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta_title" className="text-xs text-muted-foreground">
                عنوان SEO
              </Label>
              <Input
                id="meta_title"
                name="meta_title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || 'عنوان SEO مخصص'}
                maxLength={70}
                className="transition-smooth min-h-11"
              />
              <div className="flex items-center justify-between">
                <p
                  className={`text-xs transition-smooth ${metaTitle.length > 60 ? (metaTitle.length >= 70 ? 'text-destructive font-medium' : 'text-warning dark:text-warning') : 'text-muted-foreground'}`}
                >
                  {metaTitle.length}/70
                </p>
                {metaTitle.length > 0 && metaTitle.length <= 60 && (
                  <p className="text-xs text-success dark:text-success">ممتاز</p>
                )}
                {metaTitle.length > 60 && metaTitle.length < 70 && (
                  <p className="text-xs text-warning dark:text-warning">يقترب من الحد</p>
                )}
                {metaTitle.length >= 70 && (
                  <p className="text-xs text-destructive font-medium">تمَّ الوصول للحدِّ الأقصى</p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta_desc" className="text-xs text-muted-foreground">
                وصف SEO
              </Label>
              <Textarea
                id="meta_desc"
                name="meta_desc"
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                placeholder="وصف مختصر يظهر في نتائج البحث"
                maxLength={160}
                rows={3}
                className="transition-smooth resize-none min-h-22"
              />
              <div className="flex items-center justify-between">
                <p
                  className={`text-xs transition-smooth ${metaDesc.length > 140 ? (metaDesc.length >= 160 ? 'text-destructive font-medium' : 'text-warning dark:text-warning') : 'text-muted-foreground'}`}
                >
                  {metaDesc.length}/160
                </p>
                {metaDesc.length > 0 && metaDesc.length <= 140 && (
                  <p className="text-xs text-success dark:text-success">ممتاز</p>
                )}
                {metaDesc.length > 140 && metaDesc.length < 160 && (
                  <p className="text-xs text-warning dark:text-warning">يقترب من الحد</p>
                )}
                {metaDesc.length >= 160 && (
                  <p className="text-xs text-destructive font-medium">تمَّ الوصول للحد الأقصى</p>
                )}
              </div>
            </div>

            {(metaTitle || metaDesc) && (
              <>
                <div className="h-px bg-border/50" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">معاينة في نتائج البحث</p>
                  <div className="rounded-lg border border-border/50 bg-background p-3 space-y-1">
                    <p className="text-sm font-medium text-primary truncate">
                      {metaTitle || title || 'عنوان المقال'}
                    </p>
                    <p className="text-xs text-muted-foreground/60 truncate break-all">
                      {new URL(SITE_URL).host}/blog/{slug || '...'}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {metaDesc || 'وصف تلقائي سيظهر هنا بناءً على محتوى المقال...'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

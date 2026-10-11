'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Loader2, Pencil, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { useSession } from '@/frontend/state/session-provider';
import { removeAvatar, updateName, uploadAvatar } from '@/frontend/api/me';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  ProfileNameSchema,
} from '@/shared/contracts/users';

interface ProfileEditorProps {
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
}

const iconButtonClasses =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-card/60 text-foreground transition-safe duration-150 ease-out hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 disabled:pointer-events-none';

const dialogClassName =
  'sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl';

/**
 * The signed-in member's profile card. The name is edited in a dialog and the
 * avatar (upload / replace / remove) in another, both triggered from the row.
 * The profile row is the source of truth; after every successful write we ask
 * the session to re-read it so the header and community surfaces pick it up too.
 */
export function ProfileEditor({ userName, userEmail, avatarUrl }: ProfileEditorProps) {
  const { refreshProfile } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameValue, setNameValue] = useState(userName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const showAvatar = Boolean(avatarUrl) && !imageFailed;

  const openNameDialog = () => {
    setNameValue(userName ?? '');
    setNameError(null);
    setNameDialogOpen(true);
  };

  const closeNameDialog = () => {
    setNameDialogOpen(false);
    setNameError(null);
  };

  const saveName = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const parsed = ProfileNameSchema.safeParse(nameValue);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'اسم غير صالح');
      return;
    }

    setNameError(null);
    setSavingName(true);
    try {
      const result = await updateName(parsed.data);
      if (!result.success) {
        setNameError(result.error ?? 'تعذَّر تحديث الاسم');
        return;
      }
      await refreshProfile();
      setNameDialogOpen(false);
      toast.success('تمَّ تحديث الاسم');
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'تعذَّر تحديث الاسم');
    } finally {
      setSavingName(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error('يجب أن يكون الملف صورة صالحة');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('يجب أن تكون الصورة أقل من 5 ميغابايت');
      return;
    }

    setUploadingAvatar(true);
    try {
      const result = await uploadAvatar(file);
      if (!result.success) {
        toast.error(result.error ?? 'تعذَّر رفع الصُّورة');
        return;
      }
      await refreshProfile();
      setAvatarDialogOpen(false);
      toast.success('تمَّ تحديث الصُّورة');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذَّر رفع الصُّورة');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setRemovingAvatar(true);
    try {
      const result = await removeAvatar();
      if (!result.success) {
        toast.error(result.error ?? 'تعذَّر حذف الصُّورة');
        return;
      }
      await refreshProfile();
      setAvatarDialogOpen(false);
      toast.success('تمَّ حذف الصُّورة');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذَّر حذف الصُّورة');
    } finally {
      setRemovingAvatar(false);
    }
  };

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setAvatarDialogOpen(true)}
        aria-label={showAvatar ? 'تعديل أو حذف صُورة الحساب' : 'إضافة صُورة الحساب'}
        className="group relative h-14 w-14 shrink-0 rounded-full transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
          {userName ? userName.charAt(0).toUpperCase() : <User size={24} />}
          {showAvatar && (
            <Image
              src={avatarUrl!}
              alt=""
              width={56}
              height={56}
              unoptimized
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {uploadingAvatar && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="absolute -bottom-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-110">
          <Camera className="size-3" aria-hidden="true" />
        </span>
      </button>

      <div className="min-w-0 flex-1 text-start">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-base sm:text-lg font-bold text-foreground">
            {userName || userEmail || 'المستخدِم'}
          </p>
          <button
            type="button"
            onClick={openNameDialog}
            aria-label="تعديل الاسم"
            className={cn(iconButtonClasses, 'h-7 w-7 rounded-lg')}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="truncate text-xs sm:text-sm text-muted-foreground">
          {userEmail || 'حساب نشط'}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_ALLOWED_MIME_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      <Dialog
        open={nameDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeNameDialog();
        }}
      >
        <DialogContent className={dialogClassName}>
          <DialogHeader className="space-y-1.5 text-start pe-0">
            <DialogTitle className="text-lg font-bold">تعديل الاسم</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              الاسم الذي يظهر في حسابك وعبر خدماتنا.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveName} className="space-y-4">
            <Input
              autoFocus
              value={nameValue}
              onChange={(event) => {
                setNameValue(event.target.value);
                if (nameError) setNameError(null);
              }}
              maxLength={80}
              autoComplete="name"
              error={Boolean(nameError)}
              aria-label="الاسم"
            />
            {nameError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {nameError}
              </p>
            )}
            <DialogActions onCancel={closeNameDialog}>
              <HeroCtaButton type="submit" disabled={savingName} className="w-full sm:w-auto">
                {savingName ? (
                  <>
                    <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  'حفظ'
                )}
              </HeroCtaButton>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className={dialogClassName}>
          <DialogHeader className="space-y-1.5 text-start pe-0">
            <DialogTitle className="text-lg font-bold">صُورة الحساب</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {showAvatar ? 'يمكنك تغيير صُورتك أو حذفها.' : 'ارفع صُورة شخصيَّة تظهر بجانب اسمك.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            <span className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 text-3xl font-bold text-primary">
              {userName ? userName.charAt(0).toUpperCase() : <User size={44} />}
              {showAvatar && (
                <Image
                  src={avatarUrl!}
                  alt=""
                  width={112}
                  height={112}
                  unoptimized
                  onError={() => setImageFailed(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
                </span>
              )}
            </span>
            <p className="text-xs text-muted-foreground">الحد الأقصى لحجم الصُّورة 5 ميغابايت</p>
          </div>

          <DialogActions
            onCancel={() => setAvatarDialogOpen(false)}
            secondary={
              showAvatar ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRemoveAvatar}
                  disabled={removingAvatar || uploadingAvatar}
                  className="w-full sm:w-auto h-13 sm:h-14 rounded-xl px-5 text-[14px] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive transition-safe duration-300"
                >
                  {removingAvatar ? (
                    <>
                      <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                      <span>جاري الحذف...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span>حذف الصُّورة</span>
                    </>
                  )}
                </Button>
              ) : undefined
            }
          >
            <HeroCtaButton
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar || removingAvatar}
              className="w-full sm:w-auto"
            >
              {uploadingAvatar ? (
                <>
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>جاري الرَّفع...</span>
                </>
              ) : showAvatar ? (
                'تغيير الصُّورة'
              ) : (
                'رفع صُورة'
              )}
            </HeroCtaButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </section>
  );
}

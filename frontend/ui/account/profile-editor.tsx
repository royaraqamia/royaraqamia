'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Check, Loader2, Pencil, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
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

/**
 * The signed-in member's profile card, with inline editing of the display name
 * and add/replace/remove of the avatar. The profile row is the source of truth;
 * after every successful write we ask the session to re-read it so the header
 * and community surfaces pick up the change too.
 */
export function ProfileEditor({ userName, userEmail, avatarUrl }: ProfileEditorProps) {
  const { refreshProfile } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(userName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const showAvatar = Boolean(avatarUrl) && !imageFailed;

  const startEditingName = () => {
    setNameValue(userName ?? '');
    setNameError(null);
    setEditingName(true);
  };

  const cancelEditingName = () => {
    setEditingName(false);
    setNameError(null);
  };

  const saveName = async () => {
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
      setEditingName(false);
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
      toast.success('تمَّ تحديث الصُّورة');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذَّر رفع الصُّورة');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setConfirmRemoveOpen(false);
    setRemovingAvatar(true);
    try {
      const result = await removeAvatar();
      if (!result.success) {
        toast.error(result.error ?? 'تعذَّر حذف الصُّورة');
        return;
      }
      await refreshProfile();
      toast.success('تمَّ حذف الصُّورة');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذَّر حذف الصُّورة');
    } finally {
      setRemovingAvatar(false);
    }
  };

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary border border-primary/20 font-bold text-lg">
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
      </div>

      <div className="min-w-0 flex-1 text-start">
        {editingName ? (
          <div className="space-y-2">
            <Input
              autoFocus
              value={nameValue}
              onChange={(event) => {
                setNameValue(event.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveName();
                } else if (event.key === 'Escape') {
                  cancelEditingName();
                }
              }}
              maxLength={80}
              autoComplete="name"
              error={Boolean(nameError)}
              aria-label="الاسم"
            />
            {nameError && <p className="text-xs font-medium text-destructive">{nameError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={saveName}
                disabled={savingName}
                className="h-9 gap-1.5 px-3"
              >
                {savingName ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-4" aria-hidden="true" />
                )}
                <span>حفظ</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelEditingName}
                disabled={savingName}
                className="h-9 gap-1.5 px-3"
              >
                <X className="size-4" aria-hidden="true" />
                <span>إلغاء</span>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-base sm:text-lg font-bold text-foreground">
                {userName || userEmail || 'المستخدِم'}
              </p>
              <button
                type="button"
                onClick={startEditingName}
                aria-label="تعديل الاسم"
                className={cn(iconButtonClasses, 'h-7 w-7 rounded-lg')}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="truncate text-xs sm:text-sm text-muted-foreground">
              {userEmail || 'حساب نشط'}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={AVATAR_ALLOWED_MIME_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          aria-label={showAvatar ? 'تغيير الصُّورة' : 'إضافة صُورة'}
          className={iconButtonClasses}
        >
          {uploadingAvatar ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-4" aria-hidden="true" />
          )}
        </button>
        {showAvatar && (
          <button
            type="button"
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={removingAvatar}
            aria-label="حذف الصُّورة"
            className={cn(
              iconButtonClasses,
              'text-destructive hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
            )}
          >
            {removingAvatar ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="حذف الصُّورة"
        message="هل أنت متأكِّد أنَّك تريد حذف صُورتك الشَّخصيَّة؟"
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        onConfirm={handleRemoveAvatar}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </section>
  );
}

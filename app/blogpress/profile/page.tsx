'use client';

import { useState, useEffect } from 'react';
import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateProfile, logout } from '@/lib/actions/auth';
import { uploadAvatar } from '@/domains/blogpress/lib/actions/media';
import { createClient } from '@/lib/supabase/client';
import { ProfileSchema } from '@/lib/schemas';
import { Camera, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import type { User } from '@supabase/supabase-js';

type ProfileFormData = z.infer<typeof ProfileSchema>;

export default function ProfilePage() {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const {
    register,
    setValue,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: { name: '', bio: '' },
  });
  const [bioLength, setBioLength] = useState(0);

  useEffect(() => {
    (async () => {
      const supabase = await createClient();
      supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
        if (user) {
          const bio = user.user_metadata?.bio ?? '';
          const name = user.user_metadata?.full_name ?? '';
          setValue('name', name);
          setDisplayName(name);
          setValue('bio', bio);
          setBioLength(bio.length);
          setAvatarUrl(user.user_metadata?.avatar_url ?? '');
        }
        setLoading(false);
      });
    })();
  }, [setValue]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadAvatar(formData);
    setIsUploading(false);

    if (result.error) {
      toast.error(result.error);
    } else if (result.url) {
      setAvatarUrl(result.url);
      toast.success('تم تحديث الصورة الشخصية');
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">الملف الشخصي</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك وملفك الشخصي</p>
      </div>
      <Card className="transition-smooth">
        <CardHeader>
          <CardTitle>المعلومات الشخصية</CardTitle>
          <CardDescription className="mt-1">تحديث اسمك وصورتك وتفاصيل الملف الشخصي</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form action={action} className="grid gap-6">
              <div className="flex items-center gap-5">
                <div className="relative size-20 shrink-0">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="الصورة الشخصية"
                      fill
                      className="rounded-full object-cover ring-2 ring-background shadow-sm"
                    />
                  ) : (
                    <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold ring-2 ring-background">
                      {displayName ? displayName[0]?.toUpperCase() : '?'}
                    </div>
                  )}
                  <label
                    htmlFor="avatar-upload"
                    aria-label="تغيير الصورة الشخصية"
                    className="absolute bottom-0 right-0 flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-smooth"
                  >
                    <Camera className="size-4" />
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploading}
                  />
                </div>
                <div className="text-sm">
                  <p className="font-medium">الصورة الشخصية</p>
                  <p className="text-muted-foreground mt-0.5">PNG أو JPG. 5MB حد أقصى.</p>
                  {isUploading && (
                    <p className="text-xs text-primary mt-1.5 flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      جارٍ الرفع...
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  الاسم المعروض
                </Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="اسمك"
                  className="transition-smooth"
                />
                {errors?.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bio" className="text-sm font-medium">
                  السيرة الذاتية
                </Label>
                <Textarea
                  id="bio"
                  {...register('bio', { onChange: (e) => setBioLength(e.target.value.length) })}
                  placeholder="نبذة قصيرة عنك..."
                  rows={3}
                  maxLength={500}
                  className="transition-smooth"
                />
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {bioLength}/500
                </p>
                {errors?.bio && <p className="text-sm text-destructive">{errors.bio.message}</p>}
              </div>

              {state?.message && (
                <div
                  role="alert"
                  aria-live="polite"
                  className={`p-3 rounded-lg text-sm border text-center ${
                    state.success
                      ? 'bg-success/10 text-success border-success/20 dark:bg-success/20 dark:text-success dark:border-success/80'
                      : 'bg-destructive/10 text-destructive border-destructive/20'
                  }`}
                >
                  {state.message}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={pending}
                  className="transition-smooth shadow-sm hover:shadow-md"
                >
                  {pending ? (
                    <>
                      <Loader2 className="ml-2 size-4 animate-spin" />
                      جارٍ الحفظ...
                    </>
                  ) : (
                    'حفظ التغييرات'
                  )}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => logout()}
                  className="transition-smooth"
                >
                  <LogOut className="ml-2 size-4" />
                  تسجيل الخروج
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

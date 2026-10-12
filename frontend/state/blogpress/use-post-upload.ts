'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadImage } from '@/frontend/api/blogpress';
import { mediaPlaceholder, type BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { toast } from 'sonner';

interface UsePostUploadOptions {
  onImageInserted: (url: string, fileName: string) => void;
  onCoverChange: (url: string) => void;
  /** The Local Store a blob lands in when the device is offline. */
  store?: BlogpressLocalStore | null;
  postId?: string;
  /** Records the object URL ⇄ placeholder pair so a save can persist the placeholder. */
  onMediaStored?: (objectUrl: string, placeholder: string) => void;
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function usePostUpload({
  onImageInserted,
  onCoverChange,
  store,
  postId,
  onMediaStored,
}: UsePostUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [coverImageError, setCoverImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(
    async (file: File) => {
      // Offline: the bytes land in the Local Store now and the Sync Engine
      // uploads them on reconnect (ADR-0028) — the draft is never blocked.
      if (!browserOnline() && store && postId) {
        const media = await store.putMedia({
          postId,
          fileName: file.name,
          mimeType: file.type,
          blob: file,
        });
        const objectUrl = URL.createObjectURL(file);
        onMediaStored?.(objectUrl, mediaPlaceholder(media.id));
        onImageInserted(objectUrl, file.name);
        toast.success('سَتتم مزامنة الصُّورة عند عودة الاتصال');
        return;
      }

      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadImage(formData);
      setIsUploading(false);

      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }

      if ('url' in result && result.url) {
        onImageInserted(result.url, file.name);
        toast.success('تمَّ رفع الصُّورة');
      }
    },
    [onImageInserted, store, postId, onMediaStored]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
      e.target.value = '';
    },
    [handleImageUpload]
  );

  const handleCoverUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('يجب أن يكون الملف صورة');
        return;
      }
      setIsCoverUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      try {
        const result = await uploadImage(formData);
        if ('error' in result && result.error) {
          toast.error(result.error);
          return;
        }
        if ('url' in result && result.url) {
          onCoverChange(result.url);
          setCoverImageError(false);
          toast.success('تمَّ رفع صورة الغلاف');
        }
      } catch {
        toast.error('فشل رفع الصورة');
      } finally {
        setIsCoverUploading(false);
      }
    },
    [onCoverChange]
  );

  const handleCoverFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleCoverUpload(file);
      e.target.value = '';
    },
    [handleCoverUpload]
  );

  return {
    isUploading,
    isCoverUploading,
    coverImageError,
    setCoverImageError,
    fileInputRef,
    coverFileInputRef,
    handleImageUpload,
    handleFileSelect,
    handleCoverFileSelect,
  };
}

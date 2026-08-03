'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadImage } from '@/frontend/api/blogpress';
import { toast } from 'sonner';

interface UsePostUploadOptions {
  onImageInserted: (url: string, fileName: string) => void;
  onCoverChange: (url: string) => void;
}

export function usePostUpload({ onImageInserted, onCoverChange }: UsePostUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [coverImageError, setCoverImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(
    async (file: File) => {
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
    [onImageInserted]
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

import type { PostImageQuotaReason } from '@/backend/shared/post-image-quota';

/** The two meters the write-time trigger keeps, as the service reads them. */
export interface MediaUsage {
  memberBytes: number;
  memberLimitBytes: number;
  projectBytes: number;
  projectLimitBytes: number;
}

export type MediaUploadResult = { url: string } | { error: string; reason?: PostImageQuotaReason };

export interface MediaRepository {
  uploadImage(bucketName: string, fileName: string, file: File): Promise<MediaUploadResult>;
  /** Removes the object an edit or a delete orphaned. */
  deleteImage(bucketName: string, fileName: string): Promise<void>;
  /** The preflight the service checks before it writes a new object. */
  usage(): Promise<MediaUsage>;
}

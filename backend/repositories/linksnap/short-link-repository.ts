import { ShortLink } from '@/shared/contracts/linksnap';

export interface ShortLinkRepository {
  findByCode(code: string): Promise<ShortLink | null>;
  create(link: ShortLink): Promise<ShortLink>;
  listByUserId(userId: string): Promise<ShortLink[]>;
  update(
    code: string,
    updates: Partial<Pick<ShortLink, 'originalUrl' | 'isBlocked' | 'expiresAt'>>
  ): Promise<ShortLink>;
  delete(code: string, userId: string): Promise<boolean>;
  deleteMany(codes: string[], userId: string): Promise<void>;
  setExpiryMany(codes: string[], expiresAt: Date | null, userId: string): Promise<void>;
  exists(code: string): Promise<boolean>;
}

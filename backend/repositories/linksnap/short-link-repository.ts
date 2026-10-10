import { ShortLink } from '@/shared/contracts/linksnap';

/** Offline write metadata carried by an Outbox replay (ADR-0029, ticket #167). */
export interface ShortLinkWriteMeta {
  updatedAt?: string;
  /** `null` resurrects a tombstoned row; a string tombstones it. */
  deletedAt?: string | null;
}

export interface ShortLinkRepository {
  findByCode(code: string): Promise<ShortLink | null>;
  /** Finds a user's link by its client-minted id (idempotent replay target). */
  findByClientId(userId: string, clientId: string): Promise<ShortLink | null>;
  create(link: ShortLink): Promise<ShortLink>;
  listByUserId(userId: string): Promise<ShortLink[]>;
  update(
    code: string,
    updates: Partial<
      Pick<ShortLink, 'code' | 'originalUrl' | 'isBlocked' | 'expiresAt' | 'passwordHash'>
    >,
    meta?: ShortLinkWriteMeta
  ): Promise<ShortLink>;
  delete(code: string, userId: string, meta?: ShortLinkWriteMeta): Promise<boolean>;
  deleteMany(codes: string[], userId: string): Promise<void>;
  setExpiryMany(codes: string[], expiresAt: Date | null, userId: string): Promise<void>;
  exists(code: string): Promise<boolean>;
}

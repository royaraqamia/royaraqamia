import { ShortLink } from '../entities/short-link.entity';

export interface IShortLinkRepository {
  findByCode(code: string): Promise<ShortLink | null>;
  create(link: ShortLink): Promise<ShortLink>;
  listByUserId(userId: string): Promise<ShortLink[]>;
  update(
    code: string,
    updates: Partial<Pick<ShortLink, 'originalUrl' | 'isBlocked'>>
  ): Promise<ShortLink>;
  delete(code: string, userId: string): Promise<boolean>;
  exists(code: string): Promise<boolean>;
}

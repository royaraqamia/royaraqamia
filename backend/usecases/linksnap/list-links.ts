import { IShortLinkRepository } from '@/backend/ports/linksnap/short-link-repository';
import { ShortLink } from '@/backend/models/linksnap/short-link';

export class ListLinksUseCase {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  async execute(userId: string): Promise<ShortLink[]> {
    if (!userId) {
      throw new Error('User ID is required to retrieve links.');
    }
    return await this.shortLinkRepository.listByUserId(userId);
  }
}

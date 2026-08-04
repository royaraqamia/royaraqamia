import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';

export class ListLinksService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  async execute(userId: string): Promise<ShortLink[]> {
    if (!userId) {
      throw new Error('User ID is required to retrieve links.');
    }
    return await this.shortLinkRepository.listByUserId(userId);
  }
}

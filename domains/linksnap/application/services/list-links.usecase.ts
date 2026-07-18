import { IShortLinkRepository } from '../../domain/interfaces/short-link-repository.interface';
import { ShortLink } from '../../domain/entities/short-link.entity';

export class ListLinksUseCase {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  async execute(userId: string): Promise<ShortLink[]> {
    if (!userId) {
      throw new Error('User ID is required to retrieve links.');
    }
    return await this.shortLinkRepository.listByUserId(userId);
  }
}

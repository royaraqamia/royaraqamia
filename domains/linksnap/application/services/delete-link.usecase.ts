import { IShortLinkRepository } from '../../domain/interfaces/short-link-repository.interface';

export class DeleteLinkUseCase {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  async execute(code: string, userId: string): Promise<boolean> {
    if (!code) {
      throw new Error('Link code is required.');
    }
    if (!userId) {
      throw new Error('User authorization is required to delete a link.');
    }

    // Verify ownership
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new Error('Short link not found.');
    }
    if (link.userId !== userId) {
      throw new Error('Unauthorized: You do not own this short link.');
    }

    return await this.shortLinkRepository.delete(code, userId);
  }
}

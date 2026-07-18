import { IShortLinkRepository } from '../../domain/interfaces/short-link-repository.interface';
import { ShortLink } from '../../domain/entities/short-link.entity';
import { SecurityValidator } from '../../domain/services/security-validator';

export class UpdateLinkUseCase {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  /**
   * Validates and updates the destination URL of an existing short link.
   */
  async execute(code: string, userId: string, newUrl: string): Promise<ShortLink> {
    if (!code) {
      throw new Error('Short link code is required.');
    }
    if (!userId) {
      throw new Error('User authorization is required to update a link.');
    }

    // Validate and sanitize destination URL using standard rules
    const sanitizedUrl = SecurityValidator.validateUrl(newUrl);

    // Verify ownership
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new Error('Short link not found.');
    }
    if (link.userId !== userId) {
      throw new Error('Unauthorized: You do not own this short link.');
    }

    return await this.shortLinkRepository.update(code, {
      originalUrl: sanitizedUrl,
    });
  }
}

import { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';
import { AppError } from '@/backend/shared/errors';

export class UpdateLinkService {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  /**
   * Validates and updates the destination URL of an existing short link.
   */
  async execute(code: string, userId: string, newUrl: string): Promise<ShortLink> {
    if (!code || !newUrl) {
      throw new AppError("كل من 'code' و 'originalUrl' مطلوبان.", 400);
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

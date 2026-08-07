import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';
import { AppError } from '@/backend/shared/errors';

interface UpdateLinkInput {
  originalUrl?: string;
  expiresAt?: Date | null;
}

export class UpdateLinkService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  /**
   * Validates and updates the destination URL and/or expiry of an existing short link.
   */
  async execute(code: string, userId: string, input: UpdateLinkInput): Promise<ShortLink> {
    if (!code || !userId) {
      throw new AppError('رمز الرابط والمستخدم مطلوبان.', 400);
    }
    if (input.originalUrl === undefined && input.expiresAt === undefined) {
      throw new AppError('لا توجد تغييرات لتطبيقها على الرابط.', 400);
    }

    // Verify ownership
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new Error('Short link not found.');
    }
    if (link.userId !== userId) {
      throw new Error('Unauthorized: You do not own this short link.');
    }

    const updates: Partial<Pick<ShortLink, 'originalUrl' | 'expiresAt'>> = {};
    if (input.originalUrl !== undefined) {
      updates.originalUrl = SecurityValidator.validateUrl(input.originalUrl);
    }
    if (input.expiresAt !== undefined) {
      updates.expiresAt = input.expiresAt;
    }

    return await this.shortLinkRepository.update(code, updates);
  }
}

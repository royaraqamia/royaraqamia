import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';
import { CodeGenerator } from '@/backend/services/linksnap/code-generator';
import { isReservedShortCode } from '@/backend/services/linksnap/redirect-url';
import { AppError } from '@/backend/shared/errors';
import { hashPassword } from '@/backend/shared/password-hash';

interface UpdateLinkInput {
  code?: string;
  originalUrl?: string;
  expiresAt?: Date | null;
  /** String sets a new password, null clears it, undefined leaves it unchanged. */
  password?: string | null;
}

export class UpdateLinkService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  /**
   * Validates and updates the destination URL, slug and/or expiry of an
   * existing short link.
   */
  async execute(code: string, userId: string, input: UpdateLinkInput): Promise<ShortLink> {
    if (!code || !userId) {
      throw new AppError('رمز الرابط والمستخدم مطلوبان.', 400);
    }
    if (
      input.code === undefined &&
      input.originalUrl === undefined &&
      input.expiresAt === undefined &&
      input.password === undefined
    ) {
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

    const updates: Partial<Pick<ShortLink, 'code' | 'originalUrl' | 'expiresAt' | 'passwordHash'>> =
      {};
    if (input.originalUrl !== undefined) {
      updates.originalUrl = SecurityValidator.validateUrl(input.originalUrl);
    }
    if (input.expiresAt !== undefined) {
      updates.expiresAt = input.expiresAt;
    }
    if (input.password !== undefined) {
      updates.passwordHash = input.password ? hashPassword(input.password) : null;
    }
    if (input.code !== undefined && input.code !== link.code) {
      updates.code = await this.validateNewCode(input.code);
    }

    return await this.shortLinkRepository.update(code, updates);
  }

  private async validateNewCode(code: string): Promise<string> {
    const sanitized = CodeGenerator.sanitizeCustomCode(code);
    if (sanitized.length < 3) {
      throw new AppError('Custom short code must be at least 3 characters long.', 400);
    }
    if (sanitized.length > 16) {
      throw new AppError('Custom short code must be under 16 characters.', 400);
    }
    if (isReservedShortCode(sanitized)) {
      throw new AppError('This custom short code is reserved. Please try another one.', 400);
    }

    const isTaken = await this.shortLinkRepository.exists(sanitized);
    if (isTaken) {
      throw new AppError('This custom short code is already taken. Please try another one.', 400);
    }
    return sanitized;
  }
}

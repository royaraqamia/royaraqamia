import { IShortLinkRepository } from '../../domain/interfaces/short-link-repository.interface';
import { ShortLink } from '../../domain/entities/short-link.entity';
import { SecurityValidator } from '../../domain/services/security-validator';
import { CodeGenerator } from '../../domain/services/code-generator';

const MAX_CODE_ATTEMPTS = 5;

export class ShortenUrlUseCase {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  async execute(
    originalUrl: string,
    userId: string | null,
    customCode?: string
  ): Promise<ShortLink> {
    const sanitizedUrl = SecurityValidator.validateUrl(originalUrl);

    let code = '';

    if (customCode) {
      const sanitizedCode = CodeGenerator.sanitizeCustomCode(customCode);
      if (sanitizedCode.length < 3) {
        throw new Error('Custom short code must be at least 3 characters long.');
      }
      if (sanitizedCode.length > 16) {
        throw new Error('Custom short code must be under 16 characters.');
      }

      const isTaken = await this.shortLinkRepository.exists(sanitizedCode);
      if (isTaken) {
        throw new Error('This custom short code is already taken. Please try another one.');
      }
      code = sanitizedCode;
    } else {
      let attempts = 0;
      let unique = false;
      while (!unique && attempts < MAX_CODE_ATTEMPTS) {
        code = CodeGenerator.generate();
        unique = !(await this.shortLinkRepository.exists(code));
        attempts++;
      }
      if (!unique) {
        throw new Error('Server was unable to generate a unique link code. Please try again.');
      }
    }

    const now = new Date();
    const shortLink: ShortLink = {
      code,
      originalUrl: sanitizedUrl,
      userId,
      createdAt: now,
      updatedAt: now,
      isBlocked: false,
    };

    return await this.shortLinkRepository.create(shortLink);
  }
}

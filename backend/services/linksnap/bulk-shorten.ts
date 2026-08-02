import { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';
import { CodeGenerator } from '@/backend/services/linksnap/code-generator';

const MAX_CODE_ATTEMPTS = 5;

interface BulkShortenResult {
  originalUrl: string;
  shortLink?: ShortLink;
  error?: string;
}

export class BulkShortenService {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  /**
   * Shortens a list of URLs in bulk for a registered user.
   */
  async execute(urls: string[], userId: string): Promise<BulkShortenResult[]> {
    if (!userId) {
      throw new Error('Bulk shortening requires user authentication.');
    }
    if (!urls || urls.length === 0) {
      throw new Error('Please provide at least one URL to shorten.');
    }
    if (urls.length > 50) {
      throw new Error('Bulk shortening is capped at 50 links per batch to prevent abuse.');
    }

    const results: BulkShortenResult[] = [];

    for (const rawUrl of urls) {
      const sanitizedRaw = rawUrl.trim();
      if (!sanitizedRaw) {
        results.push({ originalUrl: rawUrl, error: 'Empty or whitespace input.' });
        continue;
      }

      try {
        const sanitized = SecurityValidator.validateUrl(sanitizedRaw);

        let code = '';
        let unique = false;
        let attempts = 0;
        while (!unique && attempts < MAX_CODE_ATTEMPTS) {
          code = CodeGenerator.generate();
          unique = !(await this.shortLinkRepository.exists(code));
          attempts++;
        }

        if (!unique) {
          throw new Error('Unable to generate a unique short code after 5 attempts.');
        }

        const shortLink = await this.shortLinkRepository.create({
          originalUrl: sanitized,
          code,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          isBlocked: false,
        });
        results.push({ originalUrl: sanitized, shortLink });
      } catch (err: unknown) {
        results.push({
          originalUrl: sanitizedRaw,
          error: err instanceof Error ? err.message : 'Failed to shorten link.',
        });
      }
    }

    return results;
  }
}

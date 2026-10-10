import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';
import { CodeGenerator } from '@/backend/services/linksnap/code-generator';
import { AppError } from '@/backend/shared/errors';
import { hashPassword } from '@/backend/shared/password-hash';

const MAX_CODE_ATTEMPTS = 5;

/** Offline write metadata carried by an Outbox replay (ADR-0029, ticket #167). */
interface ShortenMeta {
  clientId?: string;
  updatedAt?: string;
}

export class ShortenUrlService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  async execute(
    originalUrl: string,
    userId: string | null,
    customCode?: string,
    expiresAt?: Date | null,
    password?: string,
    meta?: ShortenMeta
  ): Promise<ShortLink> {
    const sanitizedUrl = SecurityValidator.validateUrl(originalUrl);
    const clientId = meta?.clientId ?? null;
    const now = meta?.updatedAt ? new Date(meta.updatedAt) : new Date();

    let code = '';

    if (customCode) {
      const sanitizedCode = CodeGenerator.sanitizeCustomCode(customCode);
      if (sanitizedCode.length < 3) {
        throw new AppError('Custom short code must be at least 3 characters long.', 400);
      }
      if (sanitizedCode.length > 16) {
        throw new AppError('Custom short code must be under 16 characters.', 400);
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
        throw new AppError(
          'Server was unable to generate a unique link code. Please try again.',
          500
        );
      }
    }

    // An offline create always carries a client id and (usually) its own code.
    // If the client-minted row already exists, this is an idempotent replay, so
    // its code must not be re-validated as "taken" (it is taken by itself).
    const replayed =
      clientId && userId ? await this.shortLinkRepository.findByClientId(userId, clientId) : null;

    if (customCode && !replayed) {
      const isTaken = await this.shortLinkRepository.exists(code);
      if (isTaken) {
        throw new AppError('This custom short code is already taken. Please try another one.', 400);
      }
    }

    const shortLink: ShortLink = {
      code,
      originalUrl: sanitizedUrl,
      userId,
      createdAt: now,
      updatedAt: now,
      isBlocked: false,
      expiresAt: expiresAt ?? null,
      passwordHash: password ? hashPassword(password) : null,
      clientId,
      deletedAt: null,
    };

    return await this.shortLinkRepository.create(shortLink);
  }
}

import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { isAdmin } from '@/backend/shared/admin-validator';
import { AppError } from '@/backend/shared/errors';

export class ModerateLinkService {
  constructor(
    private shortLinkRepository: ShortLinkRepository,
    private readonly adminEmails: string[]
  ) {}

  async execute(userEmail: string, code: string, isBlocked: boolean): Promise<ShortLink> {
    if (!isAdmin(userEmail, this.adminEmails)) {
      throw new Error('Access Denied: Administrative privileges required.');
    }

    if (!code || typeof isBlocked !== 'boolean') {
      throw new AppError("كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان.", 400);
    }

    // Verify link exists before attempting update
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new Error('Short link not found.');
    }

    return await this.shortLinkRepository.update(code, { isBlocked });
  }
}

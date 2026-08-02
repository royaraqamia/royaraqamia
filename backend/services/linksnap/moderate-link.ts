import { IShortLinkRepository } from '@/backend/ports/linksnap/short-link-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { AdminValidator } from '@/shared/admin-validator';

export class ModerateLinkService {
  constructor(private shortLinkRepository: IShortLinkRepository) {}

  async execute(userEmail: string, code: string, isBlocked: boolean): Promise<ShortLink> {
    if (!AdminValidator.isAdmin(userEmail)) {
      throw new Error('Access Denied: Administrative privileges required.');
    }

    if (!code) {
      throw new Error('Link code is required.');
    }

    // Verify link exists before attempting update
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new Error('Short link not found.');
    }

    return await this.shortLinkRepository.update(code, { isBlocked });
  }
}

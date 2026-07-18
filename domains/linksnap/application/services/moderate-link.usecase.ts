import { IShortLinkRepository } from '../../domain/interfaces/short-link-repository.interface';
import { ShortLink } from '../../domain/entities/short-link.entity';
import { AdminValidator } from '../../domain/services/admin-validator';

export class ModerateLinkUseCase {
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

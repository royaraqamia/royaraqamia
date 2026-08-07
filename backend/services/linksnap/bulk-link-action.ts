import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { AppError } from '@/backend/shared/errors';

export type BulkLinkAction = 'delete' | 'setExpiry';

export interface BulkLinkActionResult {
  action: BulkLinkAction;
  affected: number;
}

export class BulkLinkActionService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  async execute(
    action: BulkLinkAction,
    codes: string[],
    userId: string,
    expiresAt?: Date | null
  ): Promise<BulkLinkActionResult> {
    if (!userId) {
      throw new Error('User authorization is required to manage links.');
    }

    const uniqueCodes = Array.from(new Set(codes.filter((code) => code.length > 0)));
    if (uniqueCodes.length === 0) {
      throw new AppError('يجب اختيار رابط واحد على الأقل.', 400);
    }

    if (action === 'setExpiry' && expiresAt === undefined) {
      throw new AppError('يجب تحديد تاريخ انتهاء الصلاحية.', 400);
    }

    if (action === 'delete') {
      await this.shortLinkRepository.deleteMany(uniqueCodes, userId);
      return { action, affected: uniqueCodes.length };
    }

    await this.shortLinkRepository.setExpiryMany(uniqueCodes, expiresAt ?? null, userId);
    return { action, affected: uniqueCodes.length };
  }
}

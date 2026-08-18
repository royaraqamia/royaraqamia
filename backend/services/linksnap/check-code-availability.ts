import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { CodeGenerator } from '@/backend/services/linksnap/code-generator';
import { isReservedShortCode } from '@/backend/services/linksnap/redirect-url';

export interface CodeAvailability {
  code: string;
  available: boolean;
  error?: string;
}

export class CheckCodeAvailabilityService {
  constructor(private shortLinkRepository: ShortLinkRepository) {}

  async execute(code: string): Promise<CodeAvailability> {
    const sanitized = CodeGenerator.sanitizeCustomCode(code);

    if (sanitized.length < 3) {
      return {
        code: sanitized,
        available: false,
        error: 'الرمز يجب أن يكون 3 أحرف على الأقل.',
      };
    }
    if (sanitized.length > 16) {
      return {
        code: sanitized,
        available: false,
        error: 'الرمز يجب أن يكون أقل من 16 حرفًا.',
      };
    }
    if (isReservedShortCode(sanitized)) {
      return {
        code: sanitized,
        available: false,
        error: 'هذا الرمز محجوز ولا يمكن استخدامه.',
      };
    }

    const taken = await this.shortLinkRepository.exists(sanitized);

    return {
      code: sanitized,
      available: !taken,
      error: taken ? 'هذا الرمز مستخدم بالفعل. جرّب رمزًا آخر.' : undefined,
    };
  }
}

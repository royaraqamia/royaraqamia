import { prepareBoundedImage } from '@/backend/services/images/bounded-image';
import { IMAGE_MAX_PIXELS, IMAGE_PIXEL_REFUSAL } from '@/shared/contracts/images';
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES } from '@/shared/contracts/users';

/**
 * One definition of "an acceptable avatar file" for both faces the member owns:
 * the account's and the assistant's (ADR-0228). The two endpoints share these
 * rules rather than three hundred words each, so a format or size the account
 * accepts is never refused by the assistant editor.
 */

/** The uploaded image is not an accepted avatar, or is too large. */
export class AvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarValidationError';
  }
}

export async function prepareAvatarFile(file: File): Promise<File> {
  if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new AvatarValidationError('يجب أن يكون الملف صورة صالحة');
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AvatarValidationError('يجب أن تكون الصورة أقل من 5 ميغابايت');
  }

  const prepared = await prepareBoundedImage(file, IMAGE_MAX_PIXELS);
  if (!prepared.accepted) {
    throw new AvatarValidationError(
      prepared.reason === 'pixels' ? IMAGE_PIXEL_REFUSAL : 'يجب أن يكون الملف صورة صالحة'
    );
  }
  return prepared.file;
}

import type { AssistantIdentityRepository } from '@/backend/repositories/agent/assistant-identity-repository';
import type { AvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';
import { AvatarValidationError, prepareAvatarFile } from '@/backend/services/users/avatar-file';
import { AppError } from '@/backend/shared/errors';
import {
  AssistantIdentityInputSchema,
  DEFAULT_ASSISTANT_IDENTITY,
  type AssistantIdentity,
} from '@/shared/contracts/assistant-identity';

/**
 * The member's assistant identity (ADR-0224, ADR-0228).
 *
 * A member without a row is not an error: they read the deployment's default,
 * which is how every existing member sees نور unchanged on the deploy. A write
 * is validated here — the contract's rules, not the form's — so a hand-written
 * request cannot store a name the prompt must not receive.
 *
 * The face is the second write, and it is the account avatar's write: validate
 * the file, store it under the member's own folder, point the row at it, and
 * only then delete the object it replaced, so a failure never leaves a row
 * pointing at a missing image (#946).
 */
export interface AssistantIdentityServiceDeps {
  identities: AssistantIdentityRepository;
  avatars: AvatarStorageRepository;
  /** Overridable so a test can pin the clock the write stamps. */
  now?: () => Date;
}

const INVALID_REQUEST = 'الطلب غير مكتمل.';
const FAILED = 'تعذّر حفظ التغييرات. الرجاء المحاولة مرة أخرى.';
const AVATAR_SAVE_FAILED = 'تعذّر حفظ الصُّورة. الرجاء المحاولة مرة أخرى.';
const AVATAR_REMOVE_FAILED = 'تعذّر حذف الصُّورة. الرجاء المحاولة مرة أخرى.';

export class AssistantIdentityService {
  constructor(private readonly deps: AssistantIdentityServiceDeps) {}

  async read(userId: string): Promise<AssistantIdentity> {
    return (await this.deps.identities.read(userId)) ?? DEFAULT_ASSISTANT_IDENTITY;
  }

  /**
   * Replace the row with what the member sent. Every field arrives, because the
   * write is the whole identity: a partial update would need a second rule for
   * "the field that was absent", and the page always holds all five. The face is
   * not among them — it has its own endpoints, below.
   */
  async save(userId: string, body: unknown): Promise<AssistantIdentity> {
    const parsed = AssistantIdentityInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? INVALID_REQUEST, 400);
    }

    const at = this.clock();
    try {
      return await this.deps.identities.upsert(userId, parsed.data, at);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(FAILED, 500);
    }
  }

  /** Replace the face with an uploaded image and delete the one it replaced. */
  async updateAvatar(userId: string, file: File): Promise<AssistantIdentity> {
    let bounded: File;
    try {
      bounded = await prepareAvatarFile(file);
    } catch (error) {
      if (error instanceof AvatarValidationError) throw error;
      throw new AppError(AVATAR_SAVE_FAILED, 500);
    }

    const previous = await this.deps.identities.read(userId).catch(() => null);

    let avatarUrl: string;
    try {
      avatarUrl = await this.deps.avatars.upload(userId, bounded);
    } catch {
      throw new AppError(AVATAR_SAVE_FAILED, 500);
    }

    let saved: AssistantIdentity;
    try {
      saved = await this.deps.identities.setAvatar(userId, avatarUrl, this.clock());
    } catch (error) {
      await this.deps.avatars.remove(avatarUrl).catch(() => {});
      if (error instanceof AppError) throw error;
      throw new AppError(AVATAR_SAVE_FAILED, 500);
    }

    const previousUrl = previous?.avatarUrl?.trim();
    if (previousUrl && previousUrl !== avatarUrl) {
      await this.deps.avatars.remove(previousUrl).catch(() => {});
    }
    return saved;
  }

  /** Clear the face back to the orb and delete the stored object. */
  async removeAvatar(userId: string): Promise<AssistantIdentity> {
    const previous = await this.deps.identities.read(userId).catch(() => null);

    let saved: AssistantIdentity;
    try {
      saved = await this.deps.identities.setAvatar(userId, null, this.clock());
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(AVATAR_REMOVE_FAILED, 500);
    }

    const previousUrl = previous?.avatarUrl?.trim();
    if (previousUrl) {
      await this.deps.avatars.remove(previousUrl).catch(() => {});
    }
    return saved;
  }

  /** Back to the deployment's default: the row is deleted, not blanked. */
  async reset(userId: string): Promise<AssistantIdentity> {
    await this.deps.identities.reset(userId);
    return DEFAULT_ASSISTANT_IDENTITY;
  }

  private clock(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }
}

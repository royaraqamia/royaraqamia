import type {
  ChatAttachmentObject,
  ChatAttachmentSweepRepository,
} from '@/backend/repositories/chat/chat-attachment-sweep-repository';

/**
 * An upload that never became a message is an orphan: the composer removes what
 * it uploaded when the send fails, but a closed tab, a crashed browser or a
 * lost network is not something a client can clean up after. This is the
 * backstop the quota cannot see — it counts rows, and an orphan has none.
 */
export const CHAT_ATTACHMENT_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/** How many objects one run reads: a day of orphans, not the whole bucket. */
export const CHAT_ATTACHMENT_SWEEP_LIMIT = 2000;

export interface ChatAttachmentSweepResult {
  scanned: number;
  removed: number;
  /** True when the bucket holds more than one run read. */
  truncated: boolean;
}

/**
 * Objects no row claims, old enough that an in-flight upload is not one of
 * them. Pure, so the rule is testable without a bucket.
 */
export function orphanedAttachmentPaths(
  objects: ChatAttachmentObject[],
  referenced: Set<string>,
  nowMs: number
): string[] {
  return objects
    .filter((object) => !referenced.has(object.path))
    .filter((object) => {
      const updated = object.updatedAt ? Date.parse(object.updatedAt) : Number.NaN;
      return Number.isFinite(updated) && nowMs - updated >= CHAT_ATTACHMENT_ORPHAN_AGE_MS;
    })
    .map((object) => object.path);
}

export class ChatAttachmentSweepService {
  constructor(private readonly repo: ChatAttachmentSweepRepository) {}

  async run(nowMs: number = Date.now()): Promise<ChatAttachmentSweepResult> {
    const [referenced, listing] = await Promise.all([
      this.repo.listReferencedPaths(),
      this.repo.listObjects(CHAT_ATTACHMENT_SWEEP_LIMIT),
    ]);

    const orphans = orphanedAttachmentPaths(listing.objects, referenced, nowMs);
    await this.repo.removeObjects(orphans);

    return {
      scanned: listing.objects.length,
      removed: orphans.length,
      truncated: listing.truncated,
    };
  }
}

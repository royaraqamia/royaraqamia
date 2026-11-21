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

/** One keyset read. Storage's page cap is 1,000, so this stays at or below it. */
export const CHAT_ATTACHMENT_SWEEP_PAGE_SIZE = 1000;

/**
 * Pages one run spends before handing the position to tomorrow's run. The bound
 * keeps a night inside the workflow's timeout; the cursor keeps the bound from
 * becoming a ceiling (#1701).
 */
export const CHAT_ATTACHMENT_SWEEP_PAGES_PER_RUN = 2;

export interface ChatAttachmentSweepResult {
  scanned: number;
  removed: number;
  orphanBytes: number;
  pages: number;
  /** Where the next run resumes; empty after a full drain. */
  cursor: string;
  /** False when a run stopped with objects still past the cursor. */
  complete: boolean;
  /** What Storage holds, beside what the quota counts below. */
  bucketObjects: number;
  bucketBytes: number;
  rowObjects: number;
  rowBytes: number;
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
    const [referenced, previous, stats] = await Promise.all([
      this.repo.listReferencedPaths(),
      this.repo.readCursor(),
      this.repo.stats(),
    ]);

    let after = previous?.lastPath ?? '';
    let scanned = 0;
    let removed = 0;
    let orphanBytes = 0;
    let pages = 0;
    let complete = false;

    for (let page = 0; page < CHAT_ATTACHMENT_SWEEP_PAGES_PER_RUN; page += 1) {
      const listing = await this.repo.listPage(after, CHAT_ATTACHMENT_SWEEP_PAGE_SIZE);
      pages += 1;
      scanned += listing.objects.length;

      const orphans = orphanedAttachmentPaths(listing.objects, referenced, nowMs);
      const sizes = new Map(listing.objects.map((object) => [object.path, object.sizeBytes]));
      for (const path of orphans) orphanBytes += sizes.get(path) ?? 0;
      await this.repo.removeObjects(orphans);
      removed += orphans.length;

      if (listing.complete) {
        complete = true;
        after = '';
        break;
      }

      // The page filled, so the last name is the only position that can resume
      // without repeating it. An empty full page cannot happen; treating it as
      // the end keeps a malformed repository from looping forever.
      const last = listing.objects.at(-1);
      if (!last) {
        complete = true;
        after = '';
        break;
      }
      after = last.path;
    }

    // Write every run, including a completed one: `swept_at` is the observation
    // the daily output can show, and an empty `last_path` restarts the drain.
    await this.repo.writeCursor({ lastPath: after, sweptAt: new Date(nowMs).toISOString() });

    return {
      scanned,
      removed,
      orphanBytes,
      pages,
      cursor: after,
      complete,
      bucketObjects: stats.bucketObjects,
      bucketBytes: stats.bucketBytes,
      rowObjects: stats.rowObjects,
      rowBytes: stats.rowBytes,
    };
  }
}

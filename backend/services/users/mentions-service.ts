import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import { UsernameSchema } from '@/shared/contracts/users';

/** The most handles one render may ask about, mirroring the request contract. */
export const MENTION_LOOKUP_MAX = 50;

/**
 * Turning the handles a page mentions into the ones that are pages (ADR-0192).
 *
 * The decision this class exists for is what an unknown handle becomes: nothing.
 * A `@name` that does not name a listed member is the text the writer typed, not
 * a link to a 404 — a dead profile is worse than no profile, because the reader
 * cannot tell a typo from a deleted account.
 *
 * The repository answers only for verified, visible handles, so a hidden row
 * (ADR-0127) can never be surfaced by being mentioned in somebody else's post.
 */
export class MentionsService {
  constructor(private readonly users: PublicUsersRepository) {}

  /** The subset of `candidates` that names a listed member, lower-cased. */
  async resolve(candidates: string[]): Promise<string[]> {
    const handles = [...new Set(candidates.map((candidate) => candidate.trim().toLowerCase()))]
      .filter((handle) => UsernameSchema.safeParse(handle).success)
      .slice(0, MENTION_LOOKUP_MAX);

    if (handles.length === 0) return [];
    return this.users.getManyByUsernames(handles);
  }
}

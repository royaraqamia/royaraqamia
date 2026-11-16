import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { agencySkills } from '@/backend/services/chat/agency-skills';
import {
  decodeVectors,
  rosterHash,
  type SkillIndexFile,
} from '@/backend/shared/domain/skill-vectors';
import { logger } from '@/backend/shared/logger';

/**
 * The specialist vectors, read from the checkout (#1448).
 *
 * The roster is vendored at a pinned commit and identical in every deployment,
 * so its vectors are a generated file in the repository rather than a table:
 * public data with no tenancy, no deletion path and no read on a member's
 * session. `npm run skills:index` writes it, `npm run check:skills` fails a
 * roster edit that forgets to rebuild it, and this module trusts it only when
 * its hash matches the roster in front of it — a stale index is lexical routing,
 * never a confident shortlist built from descriptions that no longer exist.
 */

const FILE = join(process.cwd(), '.opencode', 'skills', 'agency', 'agency-roster', 'vectors.json');

export interface SkillIndex {
  model: string;
  dimensions: number;
  /** Sorted by id, the same order the hash and the builder use. */
  skills: ReadonlyArray<{ id: string; name: string; description: string }>;
  /** `count * dimensions` int8 values, row n is `skills[n]`. */
  vectors: Int8Array;
}

let cached: SkillIndex | null | undefined;

function read(): SkillIndex | null {
  const skills = [...agencySkills()].sort((left, right) => left.id.localeCompare(right.id));
  if (skills.length === 0) return null;

  let file: SkillIndexFile;
  try {
    file = JSON.parse(readFileSync(FILE, 'utf8')) as SkillIndexFile;
  } catch {
    return null;
  }

  if (file.version !== 1 || file.encoding !== 'int8') return null;
  if (file.count !== skills.length) return null;
  if (file.rosterHash !== rosterHash(skills)) {
    // One operator line, and the turn still answers: the roster moved, the
    // vectors did not, and `npm run skills:index` is the fix.
    logger.warn('The specialist vectors are older than the roster; routing lexically', {
      file: 'vectors.json',
    });
    return null;
  }

  const vectors = decodeVectors(file.vectors, file.dimensions, file.count);
  if (!vectors) return null;

  return { model: file.model, dimensions: file.dimensions, skills, vectors };
}

/** The index, or `null` when this deployment routes lexically. Read once per instance. */
export function skillIndex(): SkillIndex | null {
  if (cached === undefined) cached = read();
  return cached;
}

/** Only the scripts and the tests need this: it makes a rebuild observable. */
export function resetSkillIndex(): void {
  cached = undefined;
}

/** The width the artifact was built at, for the client that must answer in it. */
export function skillIndexDimensions(): number | null {
  return skillIndex()?.dimensions ?? null;
}

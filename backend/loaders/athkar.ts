import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from '@/backend/shared/logger';
import {
  AthkarCollectionSchema,
  type AthkarCollection,
  type AthkarPeriod,
} from '@/shared/contracts/athkar';

/**
 * Reads the vendored Athkar off disk.
 *
 * Like the Quran reader (ADR-0057) there is no database and no API here: the
 * text is a fixed asset that ships with the build, so the page is rendered once
 * and costs only static bytes. `data/athkar/` holds one file per collection and
 * `data/athkar/README.md` records where the wording comes from.
 *
 * Validation is part of the read, not a separate check: a missing file or a
 * malformed entry throws, so `next build` fails on the commit that broke it
 * rather than serving a page with a hole in it. The error names the file and the
 * failing path; a reader never sees it.
 */

const ATHKAR_DIR = join(process.cwd(), 'data', 'athkar');

const collections = new Map<AthkarPeriod, Promise<AthkarCollection>>();

/** One collection, read and validated once per process. */
export function loadAthkar(period: AthkarPeriod): Promise<AthkarCollection> {
  const cached = collections.get(period);
  if (cached) return cached;

  const loading = readCollection(period).catch((error: unknown) => {
    // A failed read must not poison the memo, or every later render of the
    // surface rethrows the first error instead of retrying the file.
    collections.delete(period);
    throw error;
  });

  collections.set(period, loading);
  return loading;
}

async function readCollection(period: AthkarPeriod): Promise<AthkarCollection> {
  const path = join(ATHKAR_DIR, `${period}.json`);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    logger.error('Failed to read the Athkar content', { period, path, error: String(error) });
    throw new Error(`Athkar content is missing: ${path}`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.error('Failed to parse the Athkar content', { period, path, error: String(error) });
    throw new Error(`Athkar content is not valid JSON: ${path}`, { cause: error });
  }

  const result = AthkarCollectionSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    logger.error('Athkar content does not match its contract', { period, path, detail });
    throw new Error(`Athkar content at ${path} is invalid — ${detail}`);
  }

  if (result.data.period !== period) {
    throw new Error(`Athkar file ${path} declares period «${result.data.period}»`);
  }

  return result.data;
}

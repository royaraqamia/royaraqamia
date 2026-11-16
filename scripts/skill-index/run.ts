import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { env } from '@/backend/config/env';
import { agencySkills } from '@/backend/services/chat/agency-skills';
import {
  encodeVectors,
  rosterHash,
  type SkillIndexFile,
} from '@/backend/shared/domain/skill-vectors';

/**
 * Build — and verify — the specialist vectors (#1448, ADR-0190).
 *
 *   npm run skills:index                # 283 descriptions -> vectors.json
 *   npm run skills:index -- --fixtures  # and the routing fixtures' query vectors
 *   npm run check:skills                # the gate: no key, no network
 *
 * The file is committed because the roster is: same content in every
 * deployment, public, no tenancy and no deletion path, so a table would add a
 * generation, a backfill and a read on a member's session to store something
 * that never changes per member. The hash in the file is what makes a
 * description edit without a rebuild a failed check rather than a confident
 * shortlist built from words that no longer exist.
 */

const ARTIFACT = join('.opencode', 'skills', 'agency', 'agency-roster', 'vectors.json');

const FIXTURES = join('backend', 'services', 'chat', '__tests__', 'fixtures', 'skill-routing.json');

interface FixtureRow {
  id: string;
  question: string;
  accept: string[];
  bucket: string;
  vector?: string;
}

/** The scripts run outside Next, which is what loads `.env` for the app. */
function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (value ?? '').replace(/^["']|["']$/g, '');
  }
}

function sorted() {
  return [...agencySkills()].sort((left, right) => left.id.localeCompare(right.id));
}

function fail(message: string): number {
  console.error(`skills: ${message}`);
  return 1;
}

function readArtifact(): SkillIndexFile | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), ARTIFACT), 'utf8')) as SkillIndexFile;
  } catch {
    return null;
  }
}

function check(): number {
  const skills = sorted();
  if (skills.length === 0) return fail('the roster is empty; nothing to verify');

  const file = readArtifact();
  if (!file) return fail(`${ARTIFACT} is missing; run \`npm run skills:index\``);

  if (file.count !== skills.length) {
    return fail(`the artifact holds ${file.count} vectors for ${skills.length} specialists`);
  }

  const hash = rosterHash(skills);
  if (file.rosterHash !== hash) {
    return fail(
      'the roster changed since the vectors were built; run `npm run skills:index`' +
        ` (artifact ${file.rosterHash.slice(0, 12)}, roster ${hash.slice(0, 12)})`
    );
  }

  const model = env.aiEmbeddingModel;
  if (model && file.model !== model) {
    return fail(`the artifact was built with ${file.model}, not ${model}; rebuild it`);
  }

  const dimensions = env.aiEmbeddingDimensions;
  if (dimensions !== undefined && file.dimensions !== dimensions) {
    return fail(
      `the artifact carries ${file.dimensions} dimensions, AI_EMBEDDING_DIMENSIONS says ${dimensions}`
    );
  }

  console.log(`skills: ok — ${file.count} vectors, ${file.dimensions} dimensions, ${file.model}`);
  return 0;
}

async function refreshFixtures(client: NonNullable<ReturnType<typeof createAiEmbeddingsClient>>) {
  const path = join(process.cwd(), FIXTURES);
  const rows = JSON.parse(readFileSync(path, 'utf8')) as FixtureRow[];
  if (rows.length === 0) return fail('no routing fixtures to refresh');

  const vectors = await client.embed(
    rows.map((row) => row.question),
    new AbortController().signal
  );
  if (!vectors || vectors.length !== rows.length) return fail('the provider answered no vectors');

  const refreshed = rows.map((row, index) => ({
    ...row,
    vector: encodeVectors([vectors[index] ?? []]),
  }));
  writeFileSync(path, `${JSON.stringify(refreshed, null, 2)}\n`, 'utf8');
  console.log(`skills: refreshed ${refreshed.length} fixture vectors`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--check')) return check();

  loadEnvFile();
  const skills = sorted();
  if (skills.length === 0) return fail('the roster is empty; nothing to embed');

  const dimensions = env.aiEmbeddingDimensions;
  if (dimensions === undefined) {
    return fail('AI_EMBEDDING_DIMENSIONS is not set; without its width a vector cannot be read');
  }

  const client = createAiEmbeddingsClient({ dimensions });
  if (!client) {
    return fail(
      'no embedding client: AI_EMBEDDING_MODEL, a key (AI_EMBEDDING_API_KEY or AI_CHAT_API_KEY)' +
        ' and a matching width are required'
    );
  }

  console.log(`skills: embedding ${skills.length} descriptions with ${client.model}`);
  const vectors = await client.embed(
    // The name and the description, which is what the roster calls itself. The
    // division is deliberately not embedded: every project-management
    // specialist would then answer to «مشروعي», and the fixtures measured that
    // as a loss rather than a gain (#1448).
    skills.map((skill) => `${skill.name}. ${skill.description}`),
    new AbortController().signal
  );
  if (!vectors || vectors.length !== skills.length) {
    return fail('the provider did not answer one vector per specialist');
  }

  const file: SkillIndexFile = {
    version: 1,
    model: client.model,
    dimensions,
    count: skills.length,
    rosterHash: rosterHash(skills),
    encoding: 'int8',
    vectors: encodeVectors(vectors),
  };
  writeFileSync(join(process.cwd(), ARTIFACT), `${JSON.stringify(file)}\n`, 'utf8');
  console.log(`skills: wrote ${ARTIFACT} (${skills.length} vectors, ${dimensions} dimensions)`);

  if (argv.includes('--fixtures')) return refreshFixtures(client);
  return 0;
}

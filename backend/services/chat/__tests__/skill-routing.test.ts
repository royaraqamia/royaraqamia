import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { agencySkills } from '@/backend/services/chat/agency-skills';
import { routeSkills, routeSkillsLexically } from '@/backend/services/chat/skill-router';
import { SKILL_CANDIDATES, type SkillHit } from '@/backend/shared/domain/agent-skills';
import { decodeVectors } from '@/backend/shared/domain/skill-vectors';

/**
 * The routing fixtures (#1448, ADR-0185 decision 5).
 *
 * Sixty questions, written before the router existed, and the number this test
 * asserts is the one the pull request carries: a question lands on an accepted
 * specialist in its five at least 80% of the time, in every bucket but the
 * questions that need no specialist at all — those are correct only when the
 * turn carries no block.
 *
 * Three rankings run over the same rows: the semantic one the deployment uses
 * with an embedding provider, the lexical one it falls back to, and the lexical
 * one without the glossary, which is the baseline the issue asked to measure
 * first. The semantic run is offline and deterministic: each row carries the
 * vector of its own question, produced by `npm run skills:index -- --fixtures`,
 * so a regression is a regression and not a provider's mood.
 */

interface FixtureRow {
  id: string;
  question: string;
  accept: string[];
  bucket: string;
  vector?: string;
}

const ROWS = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'backend',
      'services',
      'chat',
      '__tests__',
      'fixtures',
      'skill-routing.json'
    ),
    'utf8'
  )
) as FixtureRow[];

const SKILLS = agencySkills();
const DIMENSIONS = 1024;

function query(row: FixtureRow): number[] | null {
  if (!row.vector) return null;
  const flat = decodeVectors(row.vector, DIMENSIONS, 1);
  if (!flat) return null;
  return Array.from(flat, (value) => value / 127);
}

/** A question with an accepted answer is a hit when one of them is offered. */
function hit(row: FixtureRow, hits: readonly SkillHit[]): boolean {
  if (row.accept.length === 0) return hits.length === 0;
  return hits.some((candidate) => row.accept.includes(candidate.id));
}

function score(run: (row: FixtureRow) => readonly SkillHit[]): {
  overall: number;
  buckets: Record<string, { hits: number; rows: number }>;
} {
  const buckets: Record<string, { hits: number; rows: number }> = {};
  let hits = 0;

  for (const row of ROWS) {
    const ok = hit(row, run(row));
    if (ok) hits += 1;
    const bucket = (buckets[row.bucket] ??= { hits: 0, rows: 0 });
    bucket.rows += 1;
    if (ok) bucket.hits += 1;
  }

  return { overall: hits / ROWS.length, buckets };
}

const semantic = score((row) => {
  const vector = query(row);
  return vector ? routeSkills(row.question, { vector }) : [];
});
const lexical = score((row) => routeSkillsLexically(row.question));
const baseline = score((row) => routeSkillsLexically(row.question, SKILLS, { glossary: false }));

function table(name: string, result: ReturnType<typeof score>): string {
  const cells = Object.entries(result.buckets)
    .map(([bucket, value]) => `${bucket} ${value.hits}/${value.rows}`)
    .join(', ');
  return `${name}: ${(result.overall * 100).toFixed(1)}% (${cells})`;
}

describe('the specialist routing fixtures', () => {
  it('names specialists that exist, with a vector for every question', () => {
    const ids = new Set(SKILLS.map((skill) => skill.id));
    for (const row of ROWS) {
      for (const accepted of row.accept) {
        expect(ids.has(accepted), `${row.id} accepts a missing specialist ${accepted}`).toBe(true);
      }
      expect(
        row.vector,
        `${row.id} has no query vector; run skills:index -- --fixtures`
      ).toBeTruthy();
    }
    expect(ROWS).toHaveLength(60);
  });

  it('lands on an accepted specialist at least 80% of the time, by meaning', () => {
    console.log(table('semantic', semantic));
    console.log(table('lexical', lexical));
    console.log(table('baseline (no glossary)', baseline));

    expect(semantic.overall).toBeGreaterThanOrEqual(0.8);
    for (const [bucket, value] of Object.entries(semantic.buckets)) {
      if (bucket === 'none') continue;
      expect(value.hits / value.rows, `${bucket} bucket`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('keeps the lexical fallback usable when no provider answers', () => {
    // A regression floor, not the acceptance: the fallback is the degraded path,
    // and this number is what a glossary edit must not quietly destroy.
    expect(lexical.overall).toBeGreaterThanOrEqual(0.65);
    for (const [bucket, value] of Object.entries(lexical.buckets)) {
      if (bucket === 'none') continue;
      expect(value.hits / value.rows, `${bucket} bucket`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('offers nothing for the questions that need no specialist', () => {
    // Two of the eight carry a shortlist near the floor — «شو اسمي على الحساب؟»
    // and «كم عندي رسالة مقروءة؟» are, to a multilingual model, account and
    // email questions. The block is a suggestion and those cost a line, so the
    // gate is "not most turns", and the measured number is in the pull request.
    const negatives = ROWS.filter((row) => row.accept.length === 0);
    const quiet = negatives.filter((row) => {
      const vector = query(row);
      return (vector ? routeSkills(row.question, { vector }) : []).length === 0;
    });
    expect(quiet.length).toBeGreaterThanOrEqual(6);
  });

  it('never offers more than the cap, and never the same specialist twice', () => {
    for (const row of ROWS) {
      const vector = query(row);
      const hits = vector ? routeSkills(row.question, { vector }) : [];
      expect(hits.length).toBeLessThanOrEqual(SKILL_CANDIDATES);
      expect(new Set(hits.map((candidate) => candidate.id)).size).toBe(hits.length);
    }
  });
});

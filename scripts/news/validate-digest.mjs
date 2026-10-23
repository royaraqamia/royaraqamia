#!/usr/bin/env node
/**
 * Validates the model's digest before anything reaches the database, and resolves
 * each story back to the source it was selected from.
 *
 *   node scripts/news/validate-digest.mjs \
 *     --digest .news/digest.json --candidates .news/candidates.json \
 *     --date 2026-10-23 --model opencode-go/deepseek-v4.1-flash \
 *     --out .news/resolved.json
 *
 * This is the gate that makes "automatic publishing" safe. The candidate list is
 * the only set of stories that may appear, and the model names one by its short
 * `id`; a story the model improvised fails here instead of becoming a published
 * link. A failure exits 1 and the workflow publishes nothing for that day — a
 * missed digest is better than a false one.
 *
 * If the model wrote commentary around the JSON, the first object in the file is
 * taken; if it wrote no file at all, the workflow falls back to piping stdout
 * through `--digest`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  CATEGORIES,
  REGIONS,
  canonicalUrl,
  isPublishableUrl,
  normalizeTitle,
  titleSimilarity,
} from './lib.mjs';

const MIN_STORIES = 8;
const MAX_STORIES = 12;

const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3]/;
/** A translated story keeps its Arabic well above this; proper nouns are excluded. */
const MIN_ARABIC_SHARE = 0.6;
/** Four Latin words in a row is a sentence that was never translated. */
const MAX_LATIN_RUN = 4;
const PRIORITY_CATEGORIES = ['religion', 'politics', 'tech'];
const NON_ASCII_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;
const TANWEEN_YA = /\u062C\u0627\u0631\u064B/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function parseArgs(argv) {
  const options = {
    digest: resolve('.news', 'digest.json'),
    candidates: resolve('.news', 'candidates.json'),
    date: '',
    model: '',
    runUrl: '',
    out: resolve('.news', 'resolved.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (flag === '--digest') options.digest = resolve(value);
    else if (flag === '--candidates') options.candidates = resolve(value);
    else if (flag === '--date') options.date = value;
    else if (flag === '--model') options.model = value;
    else if (flag === '--run-url') options.runUrl = value;
    else if (flag === '--out') options.out = resolve(value);
    else continue;
    index += 1;
  }

  return options;
}

/** The first balanced JSON object in the text, so fences and prose are tolerated. */
export function extractJson(raw) {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('no JSON object found in the model output');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(raw.slice(start, index + 1));
    }
  }

  throw new Error('the JSON object in the model output is not closed');
}

function clean(value) {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

/**
 * Share of the prose that is Arabic, ignoring digits, punctuation and names.
 *
 * A capitalised Latin token is treated as a name ("Vision Pro", "OpenAI"), not
 * as untranslated prose: tech headlines legitimately carry product names, and
 * counting their letters would reject a perfectly good Arabic headline. A
 * lowercase Latin word is what an English sentence is made of, so it counts.
 */
export function arabicShare(value) {
  let arabic = 0;
  let foreign = 0;

  for (const token of String(value).split(/[^\p{L}\p{N}]+/u)) {
    const letters = token.replace(/[^\p{L}]/gu, '');
    if (!letters) continue;
    if (/^[\u0621-\u064A\u0671-\u06D3]/.test(letters)) arabic += letters.length;
    else if (/[A-Z]/.test(token) || /\d/.test(token)) continue;
    else foreign += letters.length;
  }

  const counted = arabic + foreign;
  return counted === 0 ? 1 : arabic / counted;
}

/** The longest run of Latin words, which is how an untranslated sentence shows up. */
export function latinWordsInARow(value) {
  let longest = 0;
  let run = 0;
  for (const token of String(value).split(/[^\p{L}'’-]+/u)) {
    if (/^[A-Za-z\u00C0-\u024F]/.test(token)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return longest;
}

function arabicTextProblems(label, value, maxLength, { required = true } = {}) {
  const problems = [];
  if (typeof value !== 'string') {
    if (required) problems.push(`${label}: missing`);
    return problems;
  }
  if (required && value.trim().length === 0) problems.push(`${label}: empty`);
  if (value.length > maxLength) problems.push(`${label}: ${value.length} chars (max ${maxLength})`);
  if (required && !ARABIC_LETTER.test(value)) problems.push(`${label}: not Arabic`);
  if (NON_ASCII_DIGITS.test(value)) problems.push(`${label}: contains non-ASCII digits`);
  if (TANWEEN_YA.test(value)) problems.push(`${label}: uses the tanween spelling instead of جاري`);

  // A single Arabic letter is not Arabic copy: the feeds include English sources,
  // so a summary can arrive untranslated and still pass a "contains Arabic" test.
  const share = arabicShare(value);
  if (value.trim().length > 0 && share < MIN_ARABIC_SHARE) {
    problems.push(
      `${label}: only ${Math.round(share * 100)}% Arabic copy (needs ${MIN_ARABIC_SHARE * 100}%)`
    );
  }
  const run = latinWordsInARow(value);
  if (run >= MAX_LATIN_RUN) {
    problems.push(`${label}: ${run} Latin words in a row, so a sentence was left untranslated`);
  }

  return problems;
}

/**
 * The editorial priorities live in the prompt, which the model can ignore without
 * anything noticing. These are reported as annotations rather than failures: a
 * quiet religion day must not cost the whole digest.
 */
function priorityWarnings(stories) {
  if (stories.length === 0) return [];

  const warnings = [];
  const lead = stories[0];
  if (lead.region === 'world') {
    warnings.push('the lead story is from the rest of the world, not the Arab or Islamic world');
  }
  if (!stories.some((story) => story.region === 'arab' || story.region === 'islamic')) {
    warnings.push('no story comes from the Arab or Islamic world');
  }
  if (!stories.some((story) => PRIORITY_CATEGORIES.includes(story.category))) {
    warnings.push('no religion, politics or tech story, though those are the priority categories');
  }
  return warnings;
}

/**
 * Checks the digest against the candidates and returns
 * `{ problems, digest, warnings }` where `digest` is the resolved, publish-ready
 * shape and `warnings` are editorial annotations (a lead story outside the Arab
 * world, no priority category) that never block publishing.
 */
export function validateDigest({ digest, candidates, date, model = '', runUrl = '' }) {
  const problems = [];

  if (!digest || typeof digest !== 'object') {
    return { problems: ['the model output is not an object'], digest: null, warnings: [] };
  }

  if (digest.digest_date !== date) {
    problems.push(`digest_date: expected ${date}, got ${String(digest.digest_date)}`);
  }

  const title = clean(digest.title);
  const lede = clean(digest.lede);
  problems.push(...arabicTextProblems('title', title, 120));
  problems.push(...arabicTextProblems('lede', lede, 400));

  const stories = Array.isArray(digest.stories) ? digest.stories : [];
  if (stories.length < MIN_STORIES || stories.length > MAX_STORIES) {
    problems.push(`stories: ${stories.length} (must be ${MIN_STORIES}-${MAX_STORIES})`);
  }

  // The model returns the candidate's short ASCII `id`, not a URL: a retyped URL
  // is where a transcription error hides (one live run produced an Arabic
  // number sign where the slug held a tatweel). A `url` is still accepted as a
  // fallback for a model that ignored the shape, matched by canonical form so a
  // feed's campaign parameter does not break it — but never by guesswork.
  const byId = new Map(candidates.items.map((item) => [item.id, item]));
  const byUrl = new Map(candidates.items.map((item) => [canonicalUrl(item.url) ?? item.url, item]));
  const seenUrls = new Set();
  const keptTitles = [];
  const resolved = [];

  stories.forEach((story, index) => {
    const label = `stories[${index + 1}]`;
    if (!story || typeof story !== 'object') {
      problems.push(`${label}: not an object`);
      return;
    }

    const id = typeof story.candidate_id === 'string' ? story.candidate_id.trim() : '';
    const url = typeof story.url === 'string' ? story.url.trim() : '';
    const key = url ? (canonicalUrl(url) ?? url) : '';
    const candidate = (id ? byId.get(id) : undefined) ?? (key ? byUrl.get(key) : undefined);

    if (!id && !url) {
      problems.push(`${label}: missing candidate_id`);
    } else if (id && !byId.has(id)) {
      problems.push(`${label}: candidate_id is not one of the candidates: ${id}`);
    } else if (!candidate) {
      problems.push(`${label}: url is not one of the candidates: ${url}`);
    } else if (!isPublishableUrl(candidate.url)) {
      problems.push(`${label}: candidate url is not http(s)`);
    } else if (seenUrls.has(candidate.url)) {
      problems.push(`${label}: duplicate story (same candidate twice)`);
    }

    const headline = clean(story.headline);
    const summary = clean(story.summary);
    const why =
      story.why_it_matters === null || story.why_it_matters === undefined
        ? null
        : clean(story.why_it_matters);

    problems.push(...arabicTextProblems(`${label}.headline`, headline, 120));
    problems.push(...arabicTextProblems(`${label}.summary`, summary, 420));
    if (why !== null) {
      problems.push(
        ...arabicTextProblems(`${label}.why_it_matters`, why, 200, { required: false })
      );
    }

    const category = CATEGORIES.includes(story.category) ? story.category : null;
    const region = REGIONS.includes(story.region) ? story.region : null;
    if (!category) problems.push(`${label}: invalid category ${JSON.stringify(story.category)}`);
    if (!region) problems.push(`${label}: invalid region ${JSON.stringify(story.region)}`);

    if (headline) {
      // Only long headlines are compared. Short ones ("مقتل 3 في غزة") overlap
      // heavily while describing different events, and rejecting a whole day over
      // that is worse than letting two similar-sounding stories through — the
      // candidates were already deduplicated by URL and title before the model saw
      // them.
      const words = normalizeTitle(headline).split(' ').filter(Boolean).length;
      if (words >= 6) {
        const duplicate = keptTitles.some(
          (existing) => existing.words >= 6 && titleSimilarity(existing.headline, headline) >= 0.9
        );
        if (duplicate) problems.push(`${label}: repeats another story's headline`);
      }
      keptTitles.push({ headline, words });
    }

    if (candidate && category && region) {
      seenUrls.add(candidate.url);
      resolved.push({
        position: resolved.length + 1,
        category,
        region,
        headline_ar: headline,
        summary_ar: summary,
        why_it_matters_ar: why,
        source_id: candidate.sourceId,
        source_name: candidate.sourceName,
        source_url: candidate.url,
        source_published_at: candidate.publishedAt,
      });
    }
  });

  if (problems.length > 0) return { problems, digest: null, warnings: [] };

  return {
    problems,
    digest: {
      digest_date: date,
      title,
      lede,
      story_count: resolved.length,
      model,
      run_url: runUrl || null,
      stories: resolved,
    },
    warnings: priorityWarnings(resolved),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error('--date YYYY-MM-DD is required (the Damascus day being published)');
  }

  const [rawDigest, rawCandidates] = await Promise.all([
    readFile(options.digest, 'utf8'),
    readFile(options.candidates, 'utf8'),
  ]);

  const candidates = JSON.parse(rawCandidates);
  const digest = extractJson(rawDigest);
  const result = validateDigest({
    digest,
    candidates,
    date: options.date,
    model: options.model,
    runUrl: options.runUrl,
  });

  if (result.problems.length > 0 || !result.digest) {
    console.error(`Digest rejected (${result.problems.length} problem(s)):`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error('Nothing was published.');
    process.exitCode = 1;
    return;
  }

  await writeFile(options.out, `${JSON.stringify(result.digest, null, 2)}\n`, 'utf8');

  // Annotations, not failures: the run page shows them without costing the day.
  for (const warning of result.warnings) console.log(`::warning::${warning}`);

  console.log(
    `Digest accepted: ${result.digest.story_count} stories, ${normalizeTitle(result.digest.title)}`
  );
  console.log(`Wrote ${options.out}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('validate-digest.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`validate-digest failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}

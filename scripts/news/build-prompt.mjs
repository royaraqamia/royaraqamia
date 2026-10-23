#!/usr/bin/env node
/**
 * Builds the editor prompt from `fetch-candidates.mjs` output.
 *
 * Kept out of the workflow YAML on purpose: the prompt is the contract between
 * the feeds and the model, it is long, and it needs to be reviewed like code when
 * it changes. The workflow runs
 *
 *   node scripts/news/build-prompt.mjs --candidates .news/candidates.json --out .news/prompt.txt
 *
 * then hands the file to `opencode run` as its message.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CATEGORIES, REGIONS } from './lib.mjs';

function parseArgs(argv) {
  const options = {
    candidates: resolve('.news', 'candidates.json'),
    out: resolve('.news', 'prompt.txt'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--candidates' && value) {
      options.candidates = resolve(value);
      index += 1;
    } else if (flag === '--out' && value) {
      options.out = resolve(value);
      index += 1;
    }
  }

  return options;
}

function compact(item) {
  return {
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
    source: item.sourceName,
    category: item.category,
    region: item.region,
    tier: item.tier,
    publishedAt: item.publishedAt,
  };
}

/**
 * The prompt is written in English because instruction-following is sharper
 * there, but every output rule is about Arabic copy. The candidate block is the
 * only source of truth: no rule asks the model to recall anything.
 */
export function buildPrompt(candidates) {
  const daily = candidates.items.map(compact);

  return `You are the editor of a daily Arabic news digest published on a Syrian website (royaraqamia).
Your job: select the day's most important stories from the candidate list below and write a short,
factual Arabic digest. The digest should read like a careful morning briefing, not like a link dump.

TODAY (Damascus): ${candidates.digestDate}

HARD RULES
1. Use ONLY the candidates below. Do not invent an event, a number, a name or a URL. If a fact is not in
   the candidate's title or excerpt, leave it out.
2. Identify each chosen story by its "id" field, copied exactly (for example: "aljazeera-ar:3"). Never
   type or edit a URL: the publisher looks the URL up from the id, and an id that is not in the list is
   rejected. Do not guess an id; copy it from the candidate you chose.
3. Write everything in Modern Standard Arabic (فصحى). English is allowed only for proper nouns and
   product names that have no Arabic form.
4. Digits are ASCII 0-9, always: 2026, 3, 12. Never Arabic-Indic digits.
5. Write the word جاري with a bare final ya: never put a tanween (fathatan) on its last letter.
6. Output ONE JSON object and nothing else - no markdown fence, no commentary before or after.

WHAT TO SELECT
- Exactly 10 stories (8 is acceptable only when the candidate list is thin; never more than 12).
- Priority order: region "arab" first, then "islamic", then "world"; and within a region, "religion",
  "politics" and "tech" before "economy", "world" and "other"; tier 1 before tier 2.
- Prefer stories with real consequence and reach over curiosities. Never include two stories about the
  same event: pick the strongest one.
- Vary categories when the day allows it, but coverage priorities matter more than even distribution.
- A candidate may be an article or a video. A video arrives as a title and a short description only;
  that is everything known about it, so never imply the footage itself was watched or summarised.
- This is a briefing about information, not only events. A decision, a rule, an explainer or a piece of
  knowledge that is still useful tomorrow is a story: prefer what leaves the reader better informed
  over what is merely new.

WHAT TO WRITE
- "title": the digest's headline for the day, at most 90 characters, no trailing period.
- "lede": 2-3 sentences, at most 320 characters, saying what the day's news is about as a whole.
- "stories": ordered as they should be read, most important first. For each:
  - "headline": at most 90 characters. Factual, specific, no clickbait, no trailing period.
  - "summary": 2-3 sentences, at most 320 characters. What happened, and who or what it affects. Base it
    strictly on the candidate's title and excerpt.
  - "why_it_matters": one sentence, at most 140 characters, or null when it adds nothing.
  - "category": one of ${CATEGORIES.join(' | ')} - you may correct the feed's default when the story is
    clearly something else.
  - "region": one of ${REGIONS.join(' | ')}.
  - "candidate_id": copied from the candidate's "id".

OUTPUT SHAPE (exactly these keys)
{
  "digest_date": "${candidates.digestDate}",
  "title": "...",
  "lede": "...",
  "stories": [
    {
      "candidate_id": "...",
      "headline": "...",
      "summary": "...",
      "why_it_matters": "..." or null,
      "category": "${CATEGORIES[0]}",
      "region": "${REGIONS[0]}"
    }
  ]
}

CANDIDATES (${daily.length} items)
${JSON.stringify(daily, null, 2)}
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = JSON.parse(await readFile(options.candidates, 'utf8'));
  if (!Array.isArray(candidates.items) || candidates.items.length === 0) {
    throw new Error(`${options.candidates} has no items`);
  }

  const prompt = buildPrompt(candidates);
  await writeFile(options.out, prompt, 'utf8');
  console.log(
    `Wrote ${options.out} (${prompt.length} chars, ${candidates.items.length} candidates)`
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('build-prompt.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`build-prompt failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
/**
 * The bot speaks Fusha, and only Fusha.
 *
 * The owner asked for one register: correct Arabic that reads like a person wrote
 * it, with no dialect and no robotic filler. The prompt asks for that; this check
 * makes a canned line that breaks it fail the pull request, because the first live
 * conversation drifted between Najdi and Levantine inside one answer and nothing
 * noticed.
 *
 * The list is deliberately short and unambiguous. A grammar checker that flagged
 * "معنا" or "قلت" would be wrong often enough to be switched off, and a check
 * people switch off protects nothing.
 *
 * Usage:
 *   npm run check:fusha             fail on a marker
 *   npm run check:fusha -- --list   print the markers
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Words that only appear in a dialect. Each has a Fusha form the sentence can use
 * instead, so a hit is a rewrite rather than a judgement call.
 */
export const MARKERS = [
  'وش',
  'شو',
  'ليش',
  'هلق',
  'هلأ',
  'منيح',
  'تبيني',
  'تبغى',
  'أبغى',
  'ابغى',
  'بدي',
  'بدك',
  'خلاص',
  'مو',
  'كذا',
  'هذي',
  'هاد',
  'هيك',
  'عنا',
  'ما بعرف',
  'ما لقيت',
  'ما في',
  'ما رح',
  'رح',
  'عم',
  'زي',
  'دحين',
  'الحين',
  'شلون',
  'وين',
  'أكو',
  'اكو',
];

/** Paths whose words are not the bot's own copy. */
const SKIP = [
  'node_modules/',
  'public/quran/',
  '.agents/',
  'scripts/check-fusha.mjs',
  'docs/adr/0129-the-telegram-bot-is-an-agent.md',
];

/** Only the bot's own words are checked; the app's copy has its own gates. */
const INCLUDE = [
  'scripts/telegram/',
  'scripts/telegram-bridge.mjs',
  'supabase/functions/telegram/',
  'docs/agents/telegram.md',
];

/**
 * `مو` inside `موضوع` is not dialect, and `رح` inside `شرح` is not either, so a
 * marker only counts as a whole word.
 */
function patternFor(marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s«»"'\`\\[>:،.!؟()|-])${escaped}(?=$|[\\s«»"'\`\\[<:،.!؟()|-])`, 'u');
}

export function scan(files) {
  const findings = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    for (const [index, line] of text.split('\n').entries()) {
      const marker = MARKERS.find((candidate) => patternFor(candidate).test(line));
      if (marker) findings.push({ path, line: index + 1, marker, text: line.trim() });
    }
  }
  return findings;
}

export function main() {
  if (process.argv.includes('--list')) {
    process.stdout.write(`${MARKERS.join('\n')}\n`);
    return 0;
  }

  // Tracked and not-yet-committed: the check runs before the commit too, which
  // is when a new line of copy is most likely to be wrong.
  const listed = [
    ...execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    }).split('\n'),
  ];
  const tracked = listed
    .map((path) => path.trim())
    .filter(Boolean)
    .filter((path) => INCLUDE.some((prefix) => path.startsWith(prefix)))
    .filter((path) => !SKIP.some((prefix) => path.includes(prefix)));

  const findings = scan(tracked);

  if (!findings.length) {
    process.stdout.write(`check:fusha: ${tracked.length} file(s), no dialect markers\n`);
    return 0;
  }

  for (const finding of findings) {
    process.stderr.write(
      `${finding.path}:${finding.line}  «${finding.marker}» is dialect — write the Fusha form\n    ${finding.text.slice(0, 140)}\n`
    );
  }
  process.stderr.write(
    `\ncheck:fusha: ${findings.length} line(s) are not Fusha. The register is a copy decision, not a preference.\n`
  );
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

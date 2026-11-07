#!/usr/bin/env node
/**
 * The three agent doors answer by the same rules (ADR-0136).
 *
 * The terminal, the Telegram bot and the product's assistant have different
 * audiences, so their prompts are written separately and in two languages. That
 * is why they drifted: a length rule added to one and not the others changed the
 * same request's answer depending on where it was asked, and nothing failed.
 *
 * The rules now live in `shared/contracts/agent-behaviour.mjs`. This check is
 * what makes the shared file the source rather than a suggestion: every door's
 * prompt must still carry every line, and the terminal's own `AGENTS.md` must
 * carry the English ones.
 *
 * Usage:
 *   npm run check:agent-behaviour
 *
 * It needs no server, no build and no network.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { behaviourLines } from '../shared/contracts/agent-behaviour.mjs';
import { buildSystemPrompt } from './telegram/prompt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Markdown wraps a long rule, the rule does not change; compare the words. */
const plain = (text) => text.replace(/\s+/g, ' ').trim();

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const surfaces = [
  {
    door: 'terminal (AGENTS.md)',
    required: behaviourLines({ surface: 'terminal', language: 'en' }),
    text: plain(read('AGENTS.md')),
  },
  {
    door: 'telegram (buildSystemPrompt)',
    required: behaviourLines({ surface: 'telegram', language: 'ar' }),
    text: plain(
      buildSystemPrompt({
        tz: { offsetMinutes: 180, formatted: '+03:00' },
        now: new Date('2026-01-01T00:00:00Z'),
      })
    ),
  },
];

const failures = [];
for (const { door, required, text } of surfaces) {
  for (const line of required) {
    if (!text.includes(plain(line))) failures.push(`${door} is missing: ${plain(line)}`);
  }
}

/**
 * The assistant's prompt is TypeScript, so it cannot be imported here. The
 * content is asserted in `chat-agent-service.test.ts`; this is the seam: the
 * file must read the shared rules instead of restating them.
 */
const assistant = read('backend/services/chat/chat-agent-service.ts');
if (!assistant.includes("from '@/shared/contracts/agent-behaviour.mjs'")) {
  failures.push(
    "the assistant does not import the shared rules ('@/shared/contracts/agent-behaviour.mjs')"
  );
}
if (!assistant.includes("behaviourLines({ surface: 'assistant' })")) {
  failures.push("the assistant does not append behaviourLines({ surface: 'assistant' })");
}

if (failures.length) {
  console.error('The agent doors disagree with shared/contracts/agent-behaviour.mjs:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nEdit the rule once, in the shared file, or update the door to match it.');
  process.exit(1);
}

console.log(`Agent behaviour: ${surfaces.length + 1} doors carry the shared rules.`);

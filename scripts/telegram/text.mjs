/**
 * The words the bot says, and the shapes it puts them in.
 *
 * Two rules live here and nowhere else:
 *
 * 1. A message is split *before* it becomes markup. Telegram rejects the whole
 *    message when one HTML tag is unbalanced, so a splitter that cuts an
 *    already-tagged string can lose the answer entirely - and the first live
 *    conversation ended with a bare "…violates not-null constrain" because a
 *    failure path was allowed to speak its own error.
 *
 * 2. Arabic is written in Fusha. Dialect is not a style choice here: the owner
 *    asked for one register, and `npm run check:fusha` fails the pull request
 *    when a canned line slips into a dialect.
 */

import { MAX_TELEGRAM } from './config.mjs';

const FENCE = '```';

/** `&`, `<`, `>` and both quotes: the same escaping serves text nodes and attributes. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The inverse, for text that came back out of the log or out of Telegram. */
export function unescapeHtml(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Everything the model must not see as if it were prose: tags, entities, tags inside code. */
export function stripHtml(text) {
  return unescapeHtml(String(text ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const PLACEHOLDER = '\u0000';

/**
 * Markdown-ish prose to the subset of HTML Telegram accepts.
 *
 * It escapes first and rewrites second: a stray `<` in an answer can then only
 * ever be text. Code is lifted out before the other rules run, because `**` and
 * `_` inside a command are part of the command.
 */
export function renderAnswer(text) {
  const source = String(text ?? '');
  if (!source.trim()) return '';

  const protectedParts = [];
  const protect = (value) => {
    protectedParts.push(value);
    return `${PLACEHOLDER}${protectedParts.length - 1}${PLACEHOLDER}`;
  };

  let html = escapeHtml(source);

  // Fenced code first: its contents must survive every later rule untouched.
  html = html.replace(/```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g, (_match, code) =>
    protect(`<pre>${String(code).replace(/\n$/, '')}</pre>`)
  );

  // Then inline code.
  html = html.replace(/`([^`\n]{1,300})`/g, (_match, code) =>
    protect(`<code>\u200E${code}</code>`)
  );

  html = html
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])__([^_\n]+)__/g, '$1<b>$2</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^[-*]\s+/gm, '\u2022 ')
    .replace(/^(\s*)\u2022\s/gm, '$1\u2022 ')
    .replace(/^\s*---+\s*$/gm, '');

  // A placeholder index is restored last so no rule can see a tag.
  html = html.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_match, index) => protectedParts[Number(index)] ?? ''
  );

  return html.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Splits markdown into pieces Telegram will accept, without ever cutting markup.
 *
 * The split happens on the markdown, before conversion, so each piece is
 * rendered on its own and every tag it opens it also closes. A fence that lands
 * across the boundary is closed at the end of one piece and reopened at the
 * start of the next, which is the only way a long code block stays readable.
 */
export function chunkMarkdown(text, limit = MAX_TELEGRAM) {
  const source = String(text ?? '');
  if (!source.trim()) return [''];

  const chunks = [];
  let current = '';
  let fenceOpen = false;

  const flush = () => {
    if (!current.trim()) {
      current = '';
      return;
    }
    const suffix = fenceOpen ? `\n${FENCE}` : '';
    chunks.push(`${current}${suffix}`.trimEnd());
    current = fenceOpen ? `${FENCE}\n` : '';
  };

  for (const line of source.split('\n')) {
    const isFence = line.trim().startsWith(FENCE);
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= limit) {
      current = candidate;
      if (isFence) fenceOpen = !fenceOpen;
      continue;
    }

    flush();

    if (line.length > limit) {
      // One enormous paragraph or code line: cut on words, never mid-tag,
      // because the tag does not exist yet.
      let rest = line;
      while (rest.length > limit) {
        const cut = rest.lastIndexOf(' ', limit);
        const at = cut > limit / 2 ? cut : limit;
        chunks.push(rest.slice(0, at));
        rest = rest.slice(at).trimStart();
      }
      current = rest;
      continue;
    }

    // `flush` may have left a reopen marker behind for a fence that continues.
    current = current ? `${current}${line}` : line;
    if (isFence) fenceOpen = !fenceOpen;
  }

  flush();
  return chunks.length ? chunks : [''];
}

/** `12` pieces becomes `(1/12)` on each, so a long answer reads as one answer. */
export function withPartNumbers(chunks) {
  if (chunks.length <= 1) return chunks;
  return chunks.map((chunk, index) => {
    const [first, ...rest] = chunk.split('\n');
    return [`${first} \u2014 (${index + 1}/${chunks.length})`, ...rest].join('\n');
  });
}

/** ASCII digits, always: the owner types Arabic-Indic digits on an Arabic keyboard. */
export function toLatinDigits(text) {
  return String(text ?? '')
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * Which language to answer in.
 *
 * The owner's rule is a mirror: Arabic in, Arabic out; English in, English out;
 * a mixed message follows its first full sentence. Nothing here guesses at a
 * third language - an answer in the language of the message is the whole point.
 */
export function languageOf(text) {
  const source = toLatinDigits(String(text ?? '')).trim();
  if (!source) return 'ar';

  const arabic = (source.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latin = (source.match(/[A-Za-z]/g) ?? []).length;
  if (!arabic && !latin) return 'ar';
  if (!latin) return 'ar';
  if (!arabic) return 'en';

  const firstSentence = source.split(/[.!?؟\n]/)[0] ?? source;
  const firstArabic = (firstSentence.match(/[\u0600-\u06ff]/g) ?? []).length;
  const firstLatin = (firstSentence.match(/[A-Za-z]/g) ?? []).length;
  if (firstArabic !== firstLatin) return firstArabic > firstLatin ? 'ar' : 'en';
  return arabic >= latin ? 'ar' : 'en';
}

/** `+3`, `-5.5`, `UTC+3`, `03:00`, `Asia/Damascus`, `دمشق` -> minutes east of UTC. */
export function parseOffset(input) {
  const text = toLatinDigits(String(input ?? '').trim());
  if (!text) return null;

  const named = {
    'asia/damascus': 180,
    damascus: 180,
    دمشق: 180,
    الشام: 180,
    utc: 0,
    gmt: 0,
    london: 0,
    riyadh: 180,
    الرياض: 180,
    dubai: 240,
    دبي: 240,
    cairo: 120,
    القاهرة: 120,
    istanbul: 180,
    إسطنبول: 180,
  };
  const lower = text.toLowerCase();
  if (lower in named) return { minutes: named[lower], name: text };

  const numeric = /^(?:utc|gmt)?\s*([+-]?\d{1,2})(?::(\d{2}))?$/i.exec(text);
  if (!numeric) return null;

  const sign = numeric[1].startsWith('-') ? -1 : 1;
  const hours = Math.abs(Number(numeric[1]));
  const minutes = numeric[2] ? Number(numeric[2]) : 0;
  if (hours > 14 || minutes > 59) return null;
  return { minutes: sign * (hours * 60 + minutes), name: text };
}

/** Renders an offset the way a person writes it: +03:00. */
export function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${rest}`;
}

const UNIT_MINUTES = {
  m: 1,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  دقيقة: 1,
  دقائق: 1,
  دقيقتين: 2,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  ساعة: 60,
  ساعات: 60,
  ساعتين: 120,
  d: 1440,
  day: 1440,
  days: 1440,
  يوم: 1440,
  أيام: 1440,
  يومين: 2880,
};

/**
 * Reads `in 30m`, `بعد نصف ساعة`, `بعد 30 دقيقة`, or a wall clock time.
 *
 * A time is interpreted in the chat's own offset, and returned as the instant.
 * The Arabic arm exists because the owner writes Arabic: a reminder feature only
 * a Latin keyboard can reach is a feature half the time.
 */
/**
 * Reads `in 30m`, `بعد نصف ساعة`, `بعد 30 دقيقة`, or a wall clock time.
 *
 * A time is interpreted in the chat's own offset, and returned as the instant.
 * The Arabic arm exists because the owner writes Arabic: a reminder feature only
 * a Latin keyboard can reach is a feature half the time.
 */
export function parseWhen(text, nowMs, tzOffsetMinutes) {
  const source = toLatinDigits(String(text ?? '').trim());

  // The named Arabic durations first, longest phrase first: `نصف ساعة` and
  // `ساعتين` carry their own unit, and matching them as "amount + unit" would
  // read `نصف ساعة` as half of sixty minutes *sixty*.
  const namedRelative = [
    { pattern: /^بعد\s+نصف\s+ساعة\s*([\s\S]*)$/, minutes: 30 },
    { pattern: /^بعد\s+ساعتين\s*([\s\S]*)$/, minutes: 120 },
    { pattern: /^بعد\s+يومين\s*([\s\S]*)$/, minutes: 2880 },
    { pattern: /^بعد\s+ساعة\s*([\s\S]*)$/, minutes: 60 },
    { pattern: /^بعد\s+يوم\s*([\s\S]*)$/, minutes: 1440 },
  ];
  for (const { pattern, minutes } of namedRelative) {
    const match = pattern.exec(source);
    if (match) return { at: new Date(nowMs + minutes * 60_000), rest: (match[1] ?? '').trim() };
  }

  const relative =
    /^(?:in\s+|بعد\s+)(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|دقيقة|دقائق|دقيقتين|ساعة|ساعات|ساعتين|يوم|أيام|يومين)\s*([\s\S]*)$/i.exec(
      source
    );
  if (relative) {
    const amount = Number(relative[1]);
    const factor = UNIT_MINUTES[(relative[2] ?? '').toLowerCase()];
    if (Number.isFinite(amount) && factor) {
      return {
        at: new Date(nowMs + amount * factor * 60_000),
        rest: (relative[3] ?? '').trim(),
      };
    }
  }

  const clock =
    /^(?:الساعة\s+|عند\s+|at\s+)?(\d{1,2}):(\d{2})\s*([\s\S]*)$/.exec(source) ??
    /^(?:الساعة\s+|عند\s+|at\s+)?(\d{1,2})(?:\s*)$/.exec(source);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = clock[2] && clock[2].length === 2 ? Number(clock[2]) : 0;
    if (hours > 23 || minutes > 59) return null;

    const now = new Date(nowMs);
    const local = new Date(nowMs + tzOffsetMinutes * 60_000);
    local.setUTCHours(hours, minutes, 0, 0);
    let at = local.getTime() - tzOffsetMinutes * 60_000;
    // A time already past means tomorrow: "ذكرني 9:30" at 16:00 is not yesterday.
    if (at <= now.getTime()) at += 24 * 60 * 60 * 1000;
    return { at: new Date(at), rest: (clock[3] ?? '').trim() };
  }

  return null;
}

/**
 * Reads a JSON object out of a model answer that may be wrapped in a code fence.
 *
 * Nothing is invented when the answer is not JSON: an empty distillation is a
 * fine outcome, and a summary made up from a parse failure is worse than none.
 */
export function parseMemory(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { summary: '', memories: [] };

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const memories = Array.isArray(parsed.memories)
      ? parsed.memories
          .filter((row) => row && typeof row.content === 'string')
          .map((row) => ({
            kind: ['preference', 'fact', 'project'].includes(row.kind) ? row.kind : 'fact',
            content: row.content.trim().slice(0, 200),
          }))
          .filter((row) => row.content.length > 3)
          .slice(0, 6)
      : [];

    return {
      summary: String(parsed.summary ?? '')
        .trim()
        .slice(0, 2000),
      memories,
    };
  } catch {
    return { summary: '', memories: [] };
  }
}

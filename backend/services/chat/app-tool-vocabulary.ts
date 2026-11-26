import { normalize } from '@/backend/services/chat/skill-router';

/**
 * The words a member uses for what an app does, and the words the apps use.
 *
 * An app's tools are named and described by the server we do not own, in
 * English; the member writes Arabic (#1917). A lexical router compares word for
 * word, so with no bridge every score is zero and a connected app is never
 * reached — the production measurement: 321 enabled tools, 0 `mcp.call` events.
 *
 * This is that bridge, and it is deliberately *not* a translation of the tools.
 * The entries name capabilities of the app ecosystem — publish, visitor, log,
 * environment, domain, table, database, key, documentation, price — so one entry
 * serves every server that has the capability, and a new server adds no entry.
 * A per-tool translation would rot at 321 tools today and 48,880 catalogue
 * servers tomorrow; this list is read in one screen and checked by the routing
 * fixtures (`chat-app-tool-routing.test.ts`).
 *
 * The same shape ADR-0185 chose for the specialist roster: an Arabic word maps
 * to the English words the roster uses, matched by stem so «زوار» finds
 * «زيارات» and «المشاريع» finds «مشاريع».
 */
const CAPABILITIES: ReadonlyArray<{ words: readonly string[]; expands: readonly string[] }> = [
  { words: ['نشر', 'انشر', 'ديبلوي'], expands: ['deploy', 'deployment'] },
  {
    words: ['زوار', 'زائر', 'زيارات', 'مشاهدات'],
    expands: ['pageview', 'pageviews', 'visitor', 'visits'],
  },
  { words: ['سجلات', 'لوجات', 'لوق'], expands: ['log', 'logs'] },
  { words: ['اخطاء'], expands: ['error', 'errors'] },
  { words: ['متغيرات', 'متغير'], expands: ['env', 'environment', 'variable'] },
  { words: ['نطاق', 'نطاقات', 'دومين'], expands: ['domain', 'domains'] },
  { words: ['مشروع', 'مشاريع'], expands: ['project', 'projects'] },
  { words: ['جدول', 'جداول'], expands: ['table', 'tables'] },
  { words: ['قاعده'], expands: ['database', 'sql', 'postgres'] },
  { words: ['مستخدمين', 'مستخدم', 'اعضاء'], expands: ['user', 'users', 'member', 'members'] },
  { words: ['رابط', 'روابط', 'لينك'], expands: ['url', 'link'] },
  { words: ['مفتاح', 'مفاتيح'], expands: ['key', 'keys'] },
  { words: ['وثائق', 'توثيق'], expands: ['documentation', 'docs'] },
  { words: ['تعليق', 'تعليقات'], expands: ['comment', 'thread', 'reply'] },
  {
    words: ['اسعار', 'سعر', 'تكلفه', 'تكلف', 'كلف', 'يكلف', 'ثمن'],
    expands: ['price', 'pricing', 'cost', 'billing'],
  },
  { words: ['الغاء'], expands: ['cancel'] },
  { words: ['حاله', 'حالات'], expands: ['status', 'state'] },
  { words: ['دوال', 'وظائف'], expands: ['function', 'functions'] },
  { words: ['بوابه'], expands: ['gateway'] },
  { words: ['ذكاء'], expands: ['ai'] },
  { words: ['لوحه'], expands: ['board', 'dashboard'] },
  { words: ['فريق', 'فرق'], expands: ['team', 'teams'] },
  { words: ['بناء'], expands: ['build'] },
  { words: ['ابحث', 'بحث'], expands: ['search', 'find'] },
  { words: ['قائمه'], expands: ['list'] },
  { words: ['انشئ', 'اضف', 'اضافه'], expands: ['create', 'add'] },
  { words: ['احذف'], expands: ['delete', 'remove'] },
  { words: ['تعديل', 'تحديث'], expands: ['update', 'edit', 'patch'] },
];

const WORD = /[\p{L}\p{N}]+/gu;

/** «المصاريف» and «مصاريفي» are the same word for a lexicon. */
function stem(word: string): string {
  return word.startsWith('ال') && word.length > 4 ? word.slice(2) : word;
}

/** A conjunction or preposition glued to the front of a word («وانشر»). */
const PROCLITICS = ['و', 'ف', 'ب', 'ك', 'ل'];

/** Every form of one word worth looking up: the word, its stem, and both without a prefix. */
function forms(word: string): string[] {
  const seen = new Set<string>();
  const pending = [word];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    const bare = stem(current);
    if (bare !== current) pending.push(bare);
    for (const proclitic of PROCLITICS) {
      if (current.startsWith(proclitic) && current.length - proclitic.length >= 3) {
        pending.push(current.slice(proclitic.length));
      }
    }
  }
  return [...seen];
}

const KEYS = CAPABILITIES.flatMap((entry) =>
  entry.words.map((word) => ({ key: normalize(word), expands: entry.expands }))
).sort((left, right) => right.key.length - left.key.length);

/**
 * A word answers a capability when it starts with the key («نطاقاً» → «نطاق»,
 * «للمشاريع» → «مشاريع»), or when the key starts with it and the word is long
 * enough to be a word rather than an article («سجل» → «سجلات»).
 *
 * The length rule is what keeps «لي» out of «لينك»: two letters are a
 * preposition far more often than a capability.
 */
function answers(word: string, key: string): boolean {
  if (word === key) return true;
  if (word.length < 3) return false;
  if (word.startsWith(key)) return true;
  return key.startsWith(word) && key.length - word.length <= 2;
}

/**
 * The message's own words, plus the words of the capabilities it names.
 *
 * The expansion is one-way on purpose: a message may say «انشر» and find
 * `create_deployment`, while a description that happens to contain "deploy"
 * never adds «نشر» to the comparison.
 */
export function capabilityWords(message: string): string[] {
  const tokens = (normalize(message).match(WORD) ?? []).filter((word) => word.length >= 2);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const form of forms(token)) {
      for (const entry of KEYS) {
        if (!answers(form, entry.key)) continue;
        for (const word of entry.expands) expanded.add(word);
        break;
      }
    }
  }

  return [...expanded];
}

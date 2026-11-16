import { agencySkills } from '@/backend/services/chat/agency-skills';
import { skillIndex, type SkillIndex } from '@/backend/services/chat/skill-index';
import {
  SKILL_CANDIDATES,
  SKILL_SIMILARITY_FLOOR,
  type SkillCandidate,
  type SkillHit,
} from '@/backend/shared/domain/agent-skills';
import { cosineAtIndex } from '@/backend/shared/domain/skill-vectors';

/**
 * Which specialists a question is asking for (#1448, ADR-0185 decision 5).
 *
 * Two signals, one answer. The vectors rank by meaning — the ranking a
 * deployment with an embedding provider uses. The roster's own words rank by
 * vocabulary, through a small Arabic-to-English glossary, because the questions
 * are Arabic and the roster is not. When both answer they are blended: meaning
 * decides, and an exact term (a member who writes «SEO» or «كود») lifts the
 * specialist named by it.
 *
 * The router never loads a body and never calls a provider. It answers at most
 * `SKILL_CANDIDATES` names, best first, and an empty list is a legitimate
 * answer — the turns that need no specialist are the ones that prove the floor.
 */

/**
 * Words a member uses for a domain, mapped to the words the roster uses.
 *
 * Each entry matches by stem, so «مصاريفي» finds «مصاريف», and the definite
 * article is dropped before it does. It is not a dictionary: it is the
 * vocabulary of this product's domains, small enough to read in one screen and
 * checked against the routing fixtures.
 */
const GLOSSARY: ReadonlyArray<{ words: readonly string[]; expands: readonly string[] }> = [
  {
    words: [
      'مصاريف',
      'مصروف',
      'ميزانيه',
      'ميزانيات',
      'مالي',
      'ماليه',
      'فاتوره',
      'رواتب',
      'تكلفه',
      'ارباح',
      'محاسب',
      'موردين',
    ],
    expands: ['financial', 'accounting', 'budget', 'expense', 'supply'],
  },
  { words: ['ضريبه', 'ضرايب'], expands: ['tax'] },
  { words: ['تسعير', 'سعر', 'اسعار'], expands: ['pricing', 'price'] },
  { words: ['عقد', 'عقود', 'قانوني', 'قانون'], expands: ['legal', 'contract', 'compliance'] },
  { words: ['تصميم', 'شعار', 'هويه', 'بصري'], expands: ['design', 'brand', 'visual'] },
  { words: ['واجهه', 'تجربه', 'مستخدم'], expands: ['ui', 'ux', 'experience', 'user'] },
  { words: ['زوار', 'تحويل'], expands: ['conversion', 'traffic'] },
  { words: ['تسويق', 'اعلان', 'حمله'], expands: ['marketing', 'campaign', 'advertising'] },
  { words: ['محتوي', 'نسخه'], expands: ['content', 'copy'] },
  { words: ['سيو'], expands: ['seo', 'search'] },
  { words: ['نتائج'], expands: ['search', 'results'] },
  { words: ['لينكدإن', 'لينكدان'], expands: ['linkedin'] },
  { words: ['هبوط'], expands: ['landing', 'conversion'] },
  { words: ['بريد', 'ايميل'], expands: ['email'] },
  { words: ['مبيعات', 'محتمل'], expands: ['sales', 'prospect'] },
  { words: ['بيانات', 'قاعده'], expands: ['data', 'database'] },
  { words: ['سحابه', 'بنيه', 'خادم'], expands: ['cloud', 'infrastructure', 'server'] },
  {
    words: ['امان', 'امنيه', 'حمايه', 'اختراق', 'ثغره', 'خصوصيه'],
    expands: ['security', 'penetration', 'privacy'],
  },
  { words: ['اختبار', 'جوده', 'اتاحه'], expands: ['testing', 'quality', 'accessibility'] },
  { words: ['كود', 'اداء'], expands: ['code', 'performance'] },
  { words: ['موبايل', 'تطبيق'], expands: ['mobile', 'app'] },
  { words: ['مشروع', 'اداره', 'خطه'], expands: ['project', 'management', 'planning'] },
  { words: ['فريق', 'اجتماع', 'ملخص'], expands: ['team', 'meeting', 'summary'] },
  { words: ['انتقال', 'نقل', 'مراجعه'], expands: ['transition', 'review'] },
  { words: ['منتج', 'بحث', 'دراسه'], expands: ['product', 'research'] },
  { words: ['احصاء', 'تحليل'], expands: ['analysis', 'statistics'] },
  { words: ['لعبه', 'العاب'], expands: ['game'] },
  { words: ['خرائط', 'خريطه', 'جغرافي', 'مكاني'], expands: ['gis', 'mapping', 'spatial'] },
  { words: ['ترجمه'], expands: ['translation', 'translator'] },
  { words: ['سيره', 'وظيفه', 'توظيف'], expands: ['resume', 'job', 'recruitment'] },
  { words: ['منحه'], expands: ['grant'] },
  { words: ['توثيق'], expands: ['documentation', 'writer'] },
  { words: ['فيديو', 'صوت', 'تدريب'], expands: ['video', 'audio', 'training'] },
  { words: ['عقار'], expands: ['real estate', 'property'] },
  { words: ['عملاء', 'عميل', 'شكوى', 'دعم'], expands: ['customer', 'client', 'support'] },
];

const WORD = /[\p{L}\p{N}]+/gu;
const MARKS = /[\u064B-\u0652\u0670\u0640]/g;
const LETTERS: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ى: 'ي',
  ؤ: 'و',
  ئ: 'ي',
  ة: 'ه',
};

/** One spelling for a question and for the glossary that reads it. */
export function normalize(value: string): string {
  return value
    .replace(MARKS, '')
    .replace(/[أإآٱىؤئة]/g, (letter) => LETTERS[letter] ?? letter)
    .toLowerCase();
}

/** «المصاريف» and «مصاريفي» are the same word for a lexicon. */
function stem(word: string): string {
  return word.startsWith('ال') && word.length > 4 ? word.slice(2) : word;
}

/** A key is matched by stem, so an inflected word still finds its domain. */
const GLOSSARY_KEYS = GLOSSARY.flatMap((entry) =>
  entry.words.map((word) => ({ key: stem(normalize(word)), words: entry.expands }))
).sort((left, right) => right.key.length - left.key.length);

function words(value: string): string[] {
  return (normalize(value).match(WORD) ?? []).filter((word) => word.length >= 2);
}

/** The question's words, Arabic expanded through the glossary into roster words. */
function queryWords(question: string, glossary: boolean): string[] {
  const tokens = words(question);
  if (!glossary) return tokens;

  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    const bare = stem(token);
    for (const entry of GLOSSARY_KEYS) {
      if (bare.startsWith(entry.key)) {
        for (const word of entry.words) expanded.add(normalize(word));
        break;
      }
    }
  }
  return [...expanded];
}

interface Prepared {
  id: string;
  name: string;
  description: string;
  idWords: string[];
  nameWords: string[];
  descriptionWords: Set<string>;
}

interface PreparedRoster {
  rows: Prepared[];
  /**
   * How much a word narrows the roster: log(1 + specialists / specialists that
   * carry it). «مشروع» is in forty descriptions and «كود» in a dozen, and
   * without this a question about code review scores as a project question —
   * the generic word wins on every project specialist at once.
   */
  rarity: Map<string, number>;
}

const prepared = new WeakMap<readonly SkillCandidate[], PreparedRoster>();

function prepare(skills: readonly SkillCandidate[]): PreparedRoster {
  const known = prepared.get(skills);
  if (known) return known;

  const rows = skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    idWords: skill.id.split('-').filter(Boolean),
    nameWords: words(skill.name),
    descriptionWords: new Set(words(skill.description)),
  }));

  const carrying = new Map<string, number>();
  for (const row of rows) {
    for (const token of new Set([...row.idWords, ...row.nameWords, ...row.descriptionWords])) {
      carrying.set(token, (carrying.get(token) ?? 0) + 1);
    }
  }
  const rarity = new Map(
    [...carrying].map(([token, count]) => [token, Math.log(1 + rows.length / count)])
  );

  const roster = { rows, rarity };
  prepared.set(skills, roster);
  return roster;
}

/**
 * How much of the question one specialist's own words answer.
 *
 * The id is the strongest signal — a member who says «مراجعة كود» means the
 * reviewer — then a word of the name, a prefix of one (an inflected or
 * abbreviated word still counts), and finally the description, which every
 * specialist shares the vocabulary of. Each hit is weighted by how rare the word
 * is in the roster, so a generic word cannot outvote a specific one.
 */
function lexicalScore(
  row: Prepared,
  tokens: readonly string[],
  rarity: Map<string, number>
): number {
  let score = 0;
  for (const token of tokens) {
    const weight = rarity.get(token) ?? 1;
    if (row.idWords.includes(token)) {
      score += 3 * weight;
    } else if (row.nameWords.includes(token)) {
      score += 2.5 * weight;
    } else if (
      token.length >= 4 &&
      (row.idWords.some((word) => word.startsWith(token)) ||
        row.nameWords.some((word) => word.startsWith(token)))
    ) {
      score += 1.5 * weight;
    } else if (row.descriptionWords.has(token)) {
      score += 0.8 * weight;
    }
  }
  return score;
}

/** How the two signals are weighed when both answer. */
const SEMANTIC_WEIGHT = 0.7;
const LEXICAL_WEIGHT = 0.3;

/** A lexical score this high is a specialist named outright by rare words. */
const LEXICAL_FULL_SCORE = 18;

/** The lexical score that offers a candidate when meaning does not. */
const LEXICAL_OFFER_FLOOR = 5;

function ranked(hits: SkillHit[]): SkillHit[] {
  return hits
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, SKILL_CANDIDATES);
}

/** The words-only ranking: the fallback, and the baseline the fixtures measure. */
export function routeSkillsLexically(
  question: string,
  skills: readonly SkillCandidate[] = agencySkills(),
  options: { glossary?: boolean } = {}
): SkillHit[] {
  const tokens = queryWords(question, options.glossary ?? true);
  if (tokens.length === 0) return [];

  const roster = prepare(skills);
  return ranked(
    roster.rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        score: lexicalScore(row, tokens, roster.rarity),
      }))
      .filter((hit) => hit.score >= LEXICAL_OFFER_FLOOR)
  );
}

function routeSkillsByMeaning(
  question: string,
  vector: readonly number[],
  index: SkillIndex,
  glossary: boolean
): SkillHit[] {
  if (vector.length !== index.dimensions) return [];

  const tokens = queryWords(question, glossary);
  const roster = prepare(index.skills);

  const hits: SkillHit[] = [];
  for (let row = 0; row < index.skills.length; row += 1) {
    const cosine = cosineAtIndex(index.vectors, index.dimensions, row, vector);
    const preparedRow = roster.rows[row];
    if (!preparedRow) continue;
    const lexical = lexicalScore(preparedRow, tokens, roster.rarity);

    // The floor is what keeps a turn that needs no specialist quiet: below it,
    // meaning offers nothing, and only a real word in the question can.
    if (cosine < SKILL_SIMILARITY_FLOOR && lexical < LEXICAL_OFFER_FLOOR) continue;

    hits.push({
      ...preparedRow,
      score:
        SEMANTIC_WEIGHT * Math.max(0, cosine) +
        LEXICAL_WEIGHT * Math.min(lexical / LEXICAL_FULL_SCORE, 1),
    });
  }

  return ranked(hits);
}

export interface SkillRouteOptions {
  /** The turn's own query vector, when this deployment can produce one. */
  vector?: readonly number[] | null;
  /** Off only for the baseline measurement: the router without its glossary. */
  glossary?: boolean;
}

/**
 * The shortlist for one turn: meaning first, words when meaning is unavailable.
 *
 * A vector of the wrong width, a missing artifact, a roster edited without a
 * rebuild — every one of them lands on the lexical ranking rather than an
 * exception, because a turn must still answer (ADR-0185 decision 4).
 */
export function routeSkills(question: string, options: SkillRouteOptions = {}): SkillHit[] {
  if (question.trim().length === 0) return [];

  const index = skillIndex();
  const vector = options.vector;
  const glossary = options.glossary ?? true;
  if (index && vector && vector.length === index.dimensions) {
    const byMeaning = routeSkillsByMeaning(question, vector, index, glossary);
    if (byMeaning.length > 0) return byMeaning;
  }

  return routeSkillsLexically(question, agencySkills(), { glossary });
}

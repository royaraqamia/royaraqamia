/**
 * The follow surface's own words, outside the button.
 *
 * The control itself (`follow-button.tsx`) reads the generated
 * `follow-button-copy.ts`: the app draws the same button, so those strings are
 * one source for both clients (`shared/copy/follow-button.json`). What stays
 * here is what only the site draws today - the two private lists and their
 * counts - because the copy pipeline names one component per surface, and a
 * row whose strings no single component renders is copy that goes stale. When
 * the app draws the lists, these move the same way the button's already did.
 */
export const FOLLOW_COPY = {
  followers: 'المتابِعون',
  following: 'المتابَعون',
  followersListTitle: 'المتابِعون',
  followingListTitle: 'المتابَعون',
  followersEmpty: 'لا يوجد متابِعون بعد.',
  followingEmpty: 'لا يوجد متابَعون بعد.',
  listLoadFailed: 'تعذَّر تحميل القائمة. أعد المحاولة.',
  listPrivate: 'هذه القائمة خاصة بصاحب الحساب.',
} as const;

export type CountKind = 'follower' | 'following';

/** Which Arabic plural form a number takes, as a form rather than a sentence. */
export type ArabicCountForm = 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * The form a count takes in Arabic: 1, 2, 3-10, 11-99, and the round hundreds.
 *
 * A unit, not a string, because the words belong to the copy module and the
 * formatter must not decide them (ADR-0104). Shared by both counts so the
 * follower and following lists cannot disagree about "3".
 */
export function arabicCountForm(count: number): ArabicCountForm {
  if (count === 1) return 'one';
  if (count === 2) return 'two';

  const remainder = count % 100;
  if (remainder >= 3 && remainder <= 10) return 'few';
  if (remainder >= 11 && remainder <= 99) return 'many';
  return 'other';
}

const COUNT_WORDS: Record<CountKind, Record<ArabicCountForm, string>> = {
  follower: {
    one: 'متابِع',
    two: 'متابِعان',
    few: '{count} متابعين',
    many: '{count} متابِعًا',
    other: '{count} متابِع',
  },
  following: {
    one: 'متابَع',
    two: 'متابَعان',
    few: '{count} متابَعين',
    many: '{count} متابَعًا',
    other: '{count} متابَع',
  },
};

/**
 * A count in words: «متابِع واحد»، «متابِعان»، «3 متابعين»، «11 متابِعًا».
 *
 * The number is substituted as ASCII digits through `formatCount`, and the
 * one/two forms drop it entirely - Arabic counts one and two without a numeral
 * - which is why they read as «متابِع واحد» and «متابِعان» rather than "1 متابِع".
 */
export function followCountLabel(count: number, kind: CountKind): string {
  const form = arabicCountForm(count);
  const words = COUNT_WORDS[kind][form];

  if (form === 'one') return kind === 'follower' ? 'متابِع واحد' : 'متابَع واحد';
  if (form === 'two') return words;
  return words.replace('{count}', count.toLocaleString('en-US'));
}

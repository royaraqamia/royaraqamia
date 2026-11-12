/**
 * The follow surface's words.
 *
 * Hand-written for now, on purpose: the copy pipeline (`shared/copy/*.json`)
 * generates both clients at once, and its parity rows name a Kotlin component
 * that does not exist until the app's half of this lands. The strings move
 * there - and the rows with them - in that change, so this file is the one
 * place they live in the meantime rather than a second copy nobody owns.
 */
export const FOLLOW_COPY = {
  follow: 'متابعة',
  unfollow: 'إلغاء المتابعة',
  unfollowTitle: 'إلغاء المتابعة؟',
  unfollowBody: 'لن تظهر منشورات {name} في متابعاتك بعد الآن.',
  confirmUnfollow: 'نعم، إلغاء المتابعة',
  cancel: 'تراجع',
  unblock: 'إلغاء الحظر',
  busy: 'جاري المتابعة...',
  followFailed: 'تعذّرت المتابعة. حاول مرة أخرى.',
  unfollowFailed: 'تعذّر إلغاء المتابعة. حاول مرة أخرى.',
  unblockFailed: 'تعذّر إلغاء الحظر. حاول مرة أخرى.',
  /** The pill the viewer's own card carries instead of a button. */
  you: 'أنت',
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

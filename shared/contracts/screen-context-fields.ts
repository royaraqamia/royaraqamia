import {
  plainText,
  SCREEN_CONTEXT_FIELDS_MAX,
  SCREEN_CONTEXT_FIELD_KEY_CHARS_MAX,
  SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX,
  SCREEN_CONTEXT_TEXT_CHARS_MAX,
} from './screen-context';

/**
 * What a surface may show of its own form, and what it may never show
 * (ADR-0181, decision 4).
 *
 * Two rules, both applied here rather than at the call site, because a rule a
 * surface has to remember is a rule one surface will forget:
 *
 * 1. **An allowlist, per surface.** A field is readable only when the surface's
 *    row below names it, so a surface added tomorrow shows nothing at all until
 *    someone decides what it may show. That default is the point: a private
 *    message body, a draft the member has not sent, and an auth screen are
 *    silent because they were never allowed, not because a rule caught them.
 *
 * 2. **A denylist, structural.** Password, OTP, payment and token fields never
 *    enter, whatever a surface asks for — and they are recognised by the input
 *    the form declared (`type`, `autocomplete`) as well as by the field's name,
 *    because a card number is a `text` input and a one-time code is a `text`
 *    input with `autocomplete="one-time-code"`. A surface that names its
 *    password field `chosen` still cannot publish it.
 *
 * Nothing here is scraped. A candidate is the form's own model — the name, the
 * input type and the value the field holds right now — handed over by the
 * component that draws it.
 */

/** One field as the surface declares it. */
export interface ScreenFieldCandidate {
  /** The field's own name, exactly as the form declares it. */
  name: string;
  /** The input's `type`: `text`, `number`, `password`... */
  type?: string;
  /** The input's `autocomplete`: this is what names a card number or a code. */
  autocomplete?: string;
  /** What the field holds right now. */
  value: string;
}

/** What one surface may publish. An empty `fields` is a surface that opted out. */
export interface ScreenContentPolicy {
  /** The field names this surface may show. Nothing else is readable. */
  fields: readonly string[];
  /** Whether a text excerpt may leave the page at all. */
  text: boolean;
}

/** Input types that are never readable, whatever the surface asks for. */
export const SCREEN_FIELD_DENY_TYPES: readonly string[] = ['password', 'hidden', 'file'];

/** Autocomplete hints that name a credential rather than ordinary text. */
export const SCREEN_FIELD_DENY_AUTOCOMPLETE: readonly string[] = [
  'current-password',
  'new-password',
  'one-time-code',
];

/** A card's own hints all start here (`cc-number`, `cc-csc`, `cc-exp`...). */
export const SCREEN_FIELD_DENY_AUTOCOMPLETE_PREFIXES: readonly string[] = ['cc-'];

/** Name tokens that are never readable, in any casing or separator style. */
export const SCREEN_FIELD_DENY_TOKENS: readonly string[] = [
  'password',
  'passwd',
  'passphrase',
  'passcode',
  'pwd',
  'pin',
  'otp',
  'totp',
  'mfa',
  '2fa',
  'cvv',
  'cvc',
  'csc',
  'iban',
  'bic',
  'swift',
  'pan',
  'token',
  'secret',
  'credential',
  'jwt',
  'bearer',
  'authorization',
  'session',
  'cookie',
  'salt',
  'mnemonic',
  'ssn',
];

/** Two-word names a separator hides (`card_number`, `cardNumber`, `cardnumber`). */
export const SCREEN_FIELD_DENY_SEQUENCES: readonly (readonly string[])[] = [
  ['card', 'number'],
  ['card', 'code'],
  ['one', 'time'],
  ['security', 'code'],
  ['verification', 'code'],
  ['api', 'key'],
  ['private', 'key'],
  ['bank', 'account'],
  ['account', 'number'],
  ['routing', 'number'],
];

/**
 * The per-surface allowlist.
 *
 * `spendtrack` is the first row because its expense form is the question this
 * program was opened for ("what is wrong with this form?"): the fields it shows
 * are the member's own, and the amount is the subject, not a secret.
 *
 * The rows with nothing are deliberate and not gaps: a chat's message body, an
 * unsent note draft, the unlock password, the verification code and an auth
 * screen are invisible by decision, and writing them down here is what makes
 * the decision auditable. A surface with no row at all is just as invisible —
 * the default is deny — so a new surface is silent until this file says
 * otherwise (ADR-0181, decision 4).
 */
export const SCREEN_CONTENT_POLICIES: Readonly<Record<string, ScreenContentPolicy>> = {
  spendtrack: {
    fields: ['amount', 'category_id', 'date', 'description', 'currency'],
    text: false,
  },
  'spendtrack-categories': {
    fields: ['name', 'colorHex'],
    text: false,
  },
  // The page's own wording, for the surfaces whose words are public and are the
  // subject of the question ("what does this verse say?"). Cap at the contract's
  // excerpt, never the page.
  'quran-surah': { fields: [], text: true },
  chats: { fields: [], text: false },
  notes: { fields: [], text: false },
  // A post is published words, and a composer holds words nobody has sent yet:
  // the post is named by id in `focus`, and neither its body nor the draft
  // travels (#1421). The default would deny both anyway; the row is the
  // decision written down.
  community: { fields: [], text: false },
  'community-post': { fields: [], text: false },
  auth: { fields: [], text: false },
  'verify-code': { fields: [], text: false },
  'linksnap-unlock': { fields: [], text: false },
  admin: { fields: [], text: false },
};

/**
 * The policy a screen id is held to, or `null` when it has none.
 *
 * `null` is not an error and not a gap to fill at runtime: it means nothing is
 * readable here, which is the same answer an opted-out row gives.
 *
 * The lookup is own-property only, because the id is client-supplied: `screenId:
 * "constructor"` indexes `Object.prototype`, which is truthy, so a plain lookup
 * returns a function where a policy should be and `readableFields` throws on it
 * instead of publishing nothing. A guard here is the one place that covers every
 * caller (ADR-0181, decision 4).
 */
export function screenContentPolicy(screenId: string): ScreenContentPolicy | null {
  return Object.hasOwn(SCREEN_CONTENT_POLICIES, screenId)
    ? SCREEN_CONTENT_POLICIES[screenId]!
    : null;
}

/** `card_number`, `cardNumber` and `cardnumber` are one name for this check. */
function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** `cvv2` is `cvv`: a digit suffix does not rename a credential. */
function tokenIsDenied(token: string): boolean {
  if (SCREEN_FIELD_DENY_TOKENS.includes(token)) return true;
  return SCREEN_FIELD_DENY_TOKENS.includes(token.replace(/^[0-9]+|[0-9]+$/g, ''));
}

function nameIsDenied(name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.some(tokenIsDenied)) return true;

  // `card_number` splits into two harmless words; the pair is what is denied.
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const pair = [tokens[index], tokens[index + 1]];
    if (
      SCREEN_FIELD_DENY_SEQUENCES.some(([first, second]) => first === pair[0] && second === pair[1])
    )
      return true;
  }

  const joined = tokens.join('');
  return SCREEN_FIELD_DENY_TOKENS.some(
    (token) => token.length >= 4 && joined.includes(token.replace(/[0-9]/g, ''))
  );
}

/** Why a field never leaves the page: its own name, its type, or its hint. */
export function fieldIsDenied(candidate: ScreenFieldCandidate): boolean {
  const type = (candidate.type ?? '').trim().toLowerCase();
  if (type && (SCREEN_FIELD_DENY_TYPES.includes(type) || type.includes('password'))) return true;

  const autocomplete = (candidate.autocomplete ?? '').trim().toLowerCase();
  if (autocomplete) {
    if (SCREEN_FIELD_DENY_AUTOCOMPLETE.includes(autocomplete)) return true;
    if (SCREEN_FIELD_DENY_AUTOCOMPLETE_PREFIXES.some((prefix) => autocomplete.startsWith(prefix)))
      return true;
    if (autocomplete.includes('password') || autocomplete.includes('one-time')) return true;
  }

  return nameIsDenied(candidate.name);
}

/**
 * The fields that may travel, redacted at the source.
 *
 * Both rules run: the allowlist decides whether the surface may show this name
 * at all, and the denylist decides whether this input is that name in anything
 * but spelling. A surface that lists `otp` in its own allowlist still gets
 * nothing, which is the failure this contract cannot recover from otherwise.
 */
export function readableFields(
  screenId: string,
  candidates: readonly ScreenFieldCandidate[] = []
): Record<string, string> {
  const policy = screenContentPolicy(screenId);
  if (!policy || policy.fields.length === 0) return {};

  const readable: Record<string, string> = {};
  for (const candidate of candidates) {
    if (Object.keys(readable).length >= SCREEN_CONTEXT_FIELDS_MAX) break;

    const name = plainText(candidate.name).slice(0, SCREEN_CONTEXT_FIELD_KEY_CHARS_MAX);
    if (name === '' || name in readable) continue;
    if (!policy.fields.some((allowed) => allowed.toLowerCase() === name.toLowerCase())) continue;
    if (fieldIsDenied(candidate)) continue;

    readable[name] = plainText(candidate.value).slice(0, SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX);
  }
  return readable;
}

/**
 * The excerpt that may travel, capped here rather than by the page.
 *
 * A surface may publish text only when its policy says so; `notes` does not,
 * because what a member has typed and not sent is theirs until they send it
 * (ADR-0181, decision 4).
 */
export function readableText(screenId: string, text = ''): string {
  const policy = screenContentPolicy(screenId);
  if (!policy || !policy.text) return '';
  return plainText(text).slice(0, SCREEN_CONTEXT_TEXT_CHARS_MAX);
}

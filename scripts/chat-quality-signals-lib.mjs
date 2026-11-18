import { FAILURE_CODES, FAILURE_SENTENCES } from '../shared/contracts/chat-agent-failures.mjs';

/**
 * The code one stored error gets in the online report. An exact match against a
 * sentence the turn writes wins; an alias covers older wording. `other` is left
 * for text no known failure produces, never for one we forgot to name.
 */
export function categorize(error) {
  const text = String(error ?? '').trim();
  for (const [code, definition] of Object.entries(FAILURE_CODES)) {
    if (code === 'other') continue;
    for (const key of definition.sentences ?? []) {
      if (text === FAILURE_SENTENCES[key]) return code;
    }
    for (const alias of definition.aliases ?? []) {
      if (text.includes(alias)) return code;
    }
  }
  return 'other';
}

/**
 * The accounts the repo itself drives: the browser/e2e accounts and the admin
 * allowlist. Their turns are test traffic, not member experience. Emails are
 * only ever used to classify a row — this module never prints one.
 */
export function harnessEmails(env = process.env) {
  const values = [
    env.E2E_TEST_EMAIL,
    env.E2E_VISUAL_EMAIL,
    ...String(env.ADMIN_EMAILS ?? '').split(','),
  ];
  return new Set(
    values
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
}

export function classifyAccount(email, harness) {
  return harness.has(
    String(email ?? '')
      .trim()
      .toLowerCase()
  )
    ? 'harness'
    : 'member';
}

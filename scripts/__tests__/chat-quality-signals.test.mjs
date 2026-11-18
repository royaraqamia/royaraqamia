import { describe, expect, it } from 'vitest';

import { FAILURE_CODES, FAILURE_SENTENCES } from '../../shared/contracts/chat-agent-failures.mjs';
import { categorize, classifyAccount, harnessEmails } from '../chat-quality-signals-lib.mjs';

/**
 * The online report reads back the sentences the turn writes (issue #1609). A
 * known failure reaching `other` is the bug this suite exists to catch.
 */
describe('failure categorisation', () => {
  it('names every sentence a failed turn can store', () => {
    for (const [code, definition] of Object.entries(FAILURE_CODES)) {
      for (const key of definition.sentences ?? []) {
        expect(categorize(FAILURE_SENTENCES[key]), key).toBe(code);
      }
    }
  });

  it('names the wording an older deployment stored before the copy changed', () => {
    expect(categorize('تعذّر الحصول على ردّ من المساعد. حاول مرّة أخرى.')).toBe('provider_failure');
  });

  it('reserves other for text no known failure writes', () => {
    expect(categorize('a brand new provider error')).toBe('other');
    expect(categorize(null)).toBe('other');
  });

  it('gives every code a cause to print beside its count', () => {
    for (const definition of Object.values(FAILURE_CODES)) {
      expect(definition.cause.length).toBeGreaterThan(0);
    }
  });
});

describe('harness accounts', () => {
  const env = {
    E2E_TEST_EMAIL: 'qa@example.test',
    E2E_VISUAL_EMAIL: 'visual@example.test',
    ADMIN_EMAILS: 'owner@example.test,second@example.test',
  };

  it('reads the comma-separated admin list as separate accounts', () => {
    const harness = harnessEmails(env);
    expect(classifyAccount('qa@example.test', harness)).toBe('harness');
    expect(classifyAccount('visual@example.test', harness)).toBe('harness');
    expect(classifyAccount('SECOND@example.test', harness)).toBe('harness');
    expect(classifyAccount('owner@example.test', harness)).toBe('harness');
  });

  it('leaves members and unknown owners in the member bucket', () => {
    const harness = harnessEmails(env);
    expect(classifyAccount('member@gmail.test', harness)).toBe('member');
    expect(classifyAccount(null, harness)).toBe('member');
  });
});

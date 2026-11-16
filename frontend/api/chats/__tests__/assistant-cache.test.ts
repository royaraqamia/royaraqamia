import { beforeEach, describe, expect, it } from 'vitest';

import {
  forgetAssistantThread,
  readAssistantSnapshot,
  writeAssistantSnapshot,
} from '@/frontend/api/chats/assistant-cache';
import {
  assistantWasOpened,
  rememberAssistantOpened,
} from '@/frontend/ui/assistant/assistant-hint';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { ChatAgentAllowance } from '@/shared/contracts/chat';

const IDENTITY = userIdentity('u-cache');
const OTHER = userIdentity('u-other');

const ALLOWANCE: ChatAgentAllowance = {
  plan: 'pro',
  member: { used: 1, cap: 40 },
  project: { used: 10, limit: 900 },
  resetsAt: '2026-11-10T00:00:00.000Z',
  apps: { used: 0, cap: 0, connected: 0 },
};

/**
 * The panel's cache (ADR-0150). The remembered face is a hint, never a grant:
 * it only decides which of the server's answers is painted first. The
 * conversation itself is `useChatThread`'s Local Store read (#1033), so this
 * module no longer keeps a second copy of it (#1562).
 */
describe('assistant cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers the thread and the last answer under the identity', () => {
    writeAssistantSnapshot(IDENTITY, {
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });

    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });
    expect(readAssistantSnapshot(OTHER)).toBeNull();
  });

  it('ignores a corrupt or wrongly shaped value', () => {
    window.localStorage.setItem(`royaraqamia:assistant:${IDENTITY}`, 'not json');
    expect(readAssistantSnapshot(IDENTITY)).toBeNull();

    window.localStorage.setItem(
      `royaraqamia:assistant:${IDENTITY}`,
      JSON.stringify({ threadId: 'a-1', allowance: { plan: 40 } })
    );
    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: 'a-1',
      available: true,
      allowance: null,
    });
  });

  it('forgets only the thread when the conversation is gone', () => {
    writeAssistantSnapshot(IDENTITY, {
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });

    forgetAssistantThread(IDENTITY);

    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: null,
      available: true,
      allowance: null,
    });
  });

  it('remembers that the door has been opened', () => {
    expect(assistantWasOpened()).toBe(false);
    rememberAssistantOpened();
    expect(assistantWasOpened()).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  createPostPublishedNotifier,
  type PostPublishedNotifierDeps,
} from '@/backend/config/notifications';
import type { RecipientEmail } from '@/backend/repositories/users/admin-users-repository';

const notice = { authorId: 'author-1', postId: 'p-1', slug: 'e2e-visual-post-1' };

function makeNotifier(overrides: Partial<PostPublishedNotifierDeps> = {}): {
  notify: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn(async () => undefined);
  createPostPublishedNotifier({
    notify,
    followersOf: async () => [],
    recipientEmailsOf: async (ids) =>
      ids.map((id) => ({ id, email: `${id}@example.test` })) as RecipientEmail[],
    env: {},
    ...overrides,
  })(notice);
  return { notify };
}

const calls = (notify: ReturnType<typeof vi.fn>) =>
  notify.mock.calls.map(([input]) => input as Record<string, unknown>);

describe('post_published follower notifier', () => {
  it('writes one row per follower of the author and none for an admin who does not follow', async () => {
    const { notify } = makeNotifier({
      followersOf: async () => ['follower-1', 'follower-2'],
      recipientEmailsOf: async (ids) =>
        ids.map((id) => ({ id, email: `${id}@example.test` })) as RecipientEmail[],
    });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    expect(calls(notify).map((input) => input.user_id)).toEqual(['follower-1', 'follower-2']);
    for (const input of calls(notify)) {
      expect(input.type).toBe('post_published');
      expect(input.title).toBe('منشور جديد');
      expect(input.metadata).toEqual({ postId: 'p-1', slug: 'e2e-visual-post-1' });
    }
  });

  it('writes nothing when a harness account authored the post', async () => {
    const { notify } = makeNotifier({
      env: { E2E_VISUAL_EMAIL: 'visual@example.test' },
      followersOf: async () => ['follower-1'],
      recipientEmailsOf: async (ids) =>
        ids.map((id) => ({
          id,
          email: id === 'author-1' ? 'visual@example.test' : `${id}@example.test`,
        })) as RecipientEmail[],
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(notify).not.toHaveBeenCalled();
  });

  it('excludes harness followers but still reaches real members', async () => {
    const { notify } = makeNotifier({
      env: {
        E2E_TEST_EMAIL: 'e2e@example.test',
        ADMIN_EMAILS: 'owner@example.test',
      },
      followersOf: async () => ['e2e-account', 'owner-account', 'member-1'],
      recipientEmailsOf: async (ids) => {
        const emails: Record<string, string> = {
          'author-1': 'author@example.test',
          'e2e-account': 'e2e@example.test',
          'owner-account': 'OWNER@EXAMPLE.TEST',
          'member-1': 'member@example.test',
        };
        return ids.map((id) => ({ id, email: emails[id] ?? `${id}@example.test` }));
      },
    });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(calls(notify).map((input) => input.user_id)).toEqual(['member-1']);
  });

  it('never notifies the author themselves', async () => {
    const { notify } = makeNotifier({
      followersOf: async () => ['author-1', 'follower-1'],
    });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(calls(notify).map((input) => input.user_id)).toEqual(['follower-1']);
  });

  it('does not throw when the graph read fails', async () => {
    const notifier = createPostPublishedNotifier({
      notify: vi.fn(async () => undefined),
      followersOf: async () => {
        throw new Error('graph unavailable');
      },
      recipientEmailsOf: async () => [],
      env: {},
    });

    expect(() => notifier(notice)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

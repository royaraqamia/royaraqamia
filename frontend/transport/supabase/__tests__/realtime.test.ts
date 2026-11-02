import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock('@/frontend/transport/supabase/client', () => ({ createClient: createClientMock }));

import {
  subscribeToPostgresChanges,
  joinBroadcastChannel,
} from '@/frontend/transport/supabase/realtime';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** A Supabase client whose channel builder records what it was asked to join. */
function fakeSupabase() {
  const builder = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  builder.on.mockReturnValue(builder);
  builder.subscribe.mockReturnValue(builder);

  const channel = vi.fn(() => builder);
  const removeChannel = vi.fn();

  return { supabase: { channel, removeChannel }, channel, builder, removeChannel };
}

type Supabase = ReturnType<typeof fakeSupabase>['supabase'];

const handlers = { onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() };

const OPTIONS = {
  channel: 'community-posts',
  table: 'posts',
  filter: 'author_id=eq.u-1',
  handlers,
};

/** Lets the `.then` attached to the client promise run. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscribeToPostgresChanges', () => {
  it('joins no channel when the unsubscribe lands before the client resolves', async () => {
    const client = deferred<Supabase>();
    createClientMock.mockReturnValue(client.promise);

    const stop = subscribeToPostgresChanges(OPTIONS);
    stop();

    const fake = fakeSupabase();
    client.resolve(fake.supabase);
    await flush();

    expect(fake.channel).not.toHaveBeenCalled();
    expect(fake.builder.subscribe).not.toHaveBeenCalled();
    expect(fake.removeChannel).not.toHaveBeenCalled();
  });

  it('removes the channel exactly once when the subscribe resolves first', async () => {
    const fake = fakeSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    const stop = subscribeToPostgresChanges(OPTIONS);
    await flush();

    expect(fake.channel).toHaveBeenCalledWith(OPTIONS.channel);

    stop();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledWith(fake.builder);
  });

  it('is safe to unsubscribe twice', async () => {
    const fake = fakeSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    const stop = subscribeToPostgresChanges(OPTIONS);
    await flush();

    stop();
    stop();

    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('is safe to unsubscribe twice before the client resolves', async () => {
    const client = deferred<Supabase>();
    createClientMock.mockReturnValue(client.promise);

    const stop = subscribeToPostgresChanges(OPTIONS);
    stop();
    stop();

    const fake = fakeSupabase();
    client.resolve(fake.supabase);
    await flush();

    expect(fake.channel).not.toHaveBeenCalled();
    expect(fake.removeChannel).not.toHaveBeenCalled();
  });

  it('binds one INSERT, UPDATE and DELETE handler to the given table and filter', async () => {
    const fake = fakeSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    subscribeToPostgresChanges(OPTIONS);
    await flush();

    expect(fake.builder.on).toHaveBeenCalledTimes(3);

    const registered = fake.builder.on.mock.calls.map(([event, config, handler]) => ({
      event,
      config,
      handler,
    }));

    expect(registered).toEqual([
      {
        event: 'postgres_changes',
        config: {
          event: 'INSERT',
          schema: 'public',
          table: OPTIONS.table,
          filter: OPTIONS.filter,
        },
        handler: handlers.onInsert,
      },
      {
        event: 'postgres_changes',
        config: {
          event: 'UPDATE',
          schema: 'public',
          table: OPTIONS.table,
          filter: OPTIONS.filter,
        },
        handler: handlers.onUpdate,
      },
      {
        event: 'postgres_changes',
        config: {
          event: 'DELETE',
          schema: 'public',
          table: OPTIONS.table,
          filter: OPTIONS.filter,
        },
        handler: handlers.onDelete,
      },
    ]);
    expect(fake.builder.subscribe).toHaveBeenCalledTimes(1);
  });

  it('has nothing to tear down when the client cannot be created', async () => {
    createClientMock.mockReturnValue(Promise.reject(new Error('blocked')));

    const stop = subscribeToPostgresChanges(OPTIONS);
    await flush();

    expect(() => stop()).not.toThrow();
  });
});

/** A client whose channel can be told it has joined, as Realtime does. */
function fakeBroadcastSupabase() {
  const builder = { on: vi.fn(), subscribe: vi.fn(), send: vi.fn() };
  builder.on.mockReturnValue(builder);
  builder.subscribe.mockReturnValue(builder);
  builder.send.mockReturnValue('ok');

  const channel = vi.fn(() => builder);
  const removeChannel = vi.fn();

  return { supabase: { channel, removeChannel }, channel, builder, removeChannel };
}

/** The status callback Realtime calls when the topic is joined or refused. */
function statusOf(builder: ReturnType<typeof fakeBroadcastSupabase>['builder']) {
  return builder.subscribe.mock.calls[0]?.[0] as (status: string) => void;
}

describe('joinBroadcastChannel', () => {
  const handlers = {
    typing: vi.fn(),
    stop: vi.fn(),
  };
  const BROADCAST = { topic: 'chat:c-1', handlers };

  it('joins the topic as a private channel and binds each event', async () => {
    const fake = fakeBroadcastSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    joinBroadcastChannel(BROADCAST);
    await flush();

    expect(fake.channel).toHaveBeenCalledWith('chat:c-1', { config: { private: true } });
    expect(fake.builder.on.mock.calls.map(([type, config]) => [type, config])).toEqual([
      ['broadcast', { event: 'typing' }],
      ['broadcast', { event: 'stop' }],
    ]);
  });

  it('hands the payload of a received event to its handler', async () => {
    const fake = fakeBroadcastSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    joinBroadcastChannel(BROADCAST);
    await flush();

    const typing = fake.builder.on.mock.calls[0]?.[2] as (message: unknown) => void;
    typing({ type: 'broadcast', event: 'typing', payload: { userId: 'peer-2' } });

    expect(handlers.typing).toHaveBeenCalledWith({ userId: 'peer-2' });
  });

  it('waits for the join before sending, then flushes what was queued', async () => {
    const fake = fakeBroadcastSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    const channel = joinBroadcastChannel(BROADCAST);
    await flush();

    channel.send('typing', { userId: 'me' });
    expect(fake.builder.send).not.toHaveBeenCalled();

    statusOf(fake.builder)('SUBSCRIBED');
    expect(fake.builder.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: 'me' },
    });
  });

  it('sends straight through once joined, and drops what comes after leave', async () => {
    const fake = fakeBroadcastSupabase();
    createClientMock.mockReturnValue(Promise.resolve(fake.supabase));

    const channel = joinBroadcastChannel(BROADCAST);
    await flush();
    statusOf(fake.builder)('SUBSCRIBED');

    channel.send('stop');
    expect(fake.builder.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'stop',
      payload: {},
    });

    channel.leave();
    expect(fake.removeChannel).toHaveBeenCalledWith(fake.builder);

    channel.send('typing');
    expect(fake.builder.send).toHaveBeenCalledTimes(1);
  });

  it('is safe to leave twice, and before the client resolves', async () => {
    const client = deferred<Supabase>();
    createClientMock.mockReturnValue(client.promise);

    const channel = joinBroadcastChannel(BROADCAST);
    channel.leave();
    channel.leave();

    const fake = fakeBroadcastSupabase();
    client.resolve(fake.supabase);
    await flush();

    expect(fake.channel).not.toHaveBeenCalled();
    expect(fake.removeChannel).not.toHaveBeenCalled();
  });
});

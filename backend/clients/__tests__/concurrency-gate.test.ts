import { describe, expect, it } from 'vitest';
import { createConcurrencyGate } from '@/backend/clients/concurrency-gate';

describe('createConcurrencyGate (in-memory fallback)', () => {
  it('hands out at most `limit` slots and reuses a released one', async () => {
    const gate = createConcurrencyGate({ limit: 1, ttlSeconds: 60 });

    const first = await gate.acquire();
    expect(first).not.toBeNull();
    expect(await gate.acquire()).toBeNull();

    if (!first) throw new Error('expected a slot');
    await first();

    const second = await gate.acquire();
    expect(second).not.toBeNull();
  });

  it('treats release as idempotent', async () => {
    const gate = createConcurrencyGate({ limit: 2, ttlSeconds: 60 });

    const held = await gate.acquire();
    if (!held) throw new Error('expected a slot');
    await held();
    await held();

    expect(await gate.acquire()).not.toBeNull();
    expect(await gate.acquire()).not.toBeNull();
    expect(await gate.acquire()).toBeNull();
  });
});

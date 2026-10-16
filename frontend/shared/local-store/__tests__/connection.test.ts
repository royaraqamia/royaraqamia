import { describe, it, expect, vi } from 'vitest';
import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';

/** The connection only ever calls `close()`; the operation gets the same object. */
function fakeDb() {
  return {
    closed: false,
    close(this: { closed: boolean }) {
      this.closed = true;
    },
  } as unknown as IDBDatabase & { closed: boolean };
}

function deferred<T = void>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('LocalStoreConnection', () => {
  it('runs the operation against the database and returns its value', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    let calls = 0;

    const result = await connection.run(async (opened) => {
      calls += 1;
      expect(opened).toBe(db);
      return ['row'];
    }, []);

    expect(result).toEqual(['row']);
    expect(calls).toBe(1);
  });

  it('resolves to the empty value instead of running an operation once closed', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    const operation = vi.fn(async () => ['row']);

    connection.close();

    expect(connection.isClosing).toBe(true);
    await expect(connection.run(operation, [])).resolves.toEqual([]);
    expect(operation).not.toHaveBeenCalled();
    expect(db.closed).toBe(true);
  });

  it('defers the underlying close until an in-flight operation settles', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    const gate = deferred();
    let observedClosedDuringRun: boolean | null = null;

    const inFlight = connection.run(async () => {
      await gate.promise;
      observedClosedDuringRun = db.closed;
      return 'done';
    }, 'skipped');

    connection.close();
    // The store is closed to new work, but the in-flight transaction keeps its
    // connection: closing it here is what produced the InvalidStateError (#204).
    expect(db.closed).toBe(false);

    gate.resolve();
    await expect(inFlight).resolves.toBe('done');
    expect(observedClosedDuringRun).toBe(false);
    expect(db.closed).toBe(true);
  });

  it('no-ops an operation that arrives while another one is still in flight', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    const gate = deferred();

    const inFlight = connection.run(async () => {
      await gate.promise;
      return 'done';
    }, 'skipped');

    connection.close();
    const late = vi.fn(async () => 'late');

    await expect(connection.run(late, 'skipped')).resolves.toBe('skipped');
    expect(late).not.toHaveBeenCalled();

    gate.resolve();
    await expect(inFlight).resolves.toBe('done');
    expect(db.closed).toBe(true);
  });

  it('closes once and tolerates repeated close calls', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    const closes = vi.fn();
    (db as { close: () => void }).close = closes;

    connection.close();
    connection.close();
    expect(closes).toHaveBeenCalledTimes(1);

    await connection.run(async () => 'never', 'skipped');
    expect(closes).toHaveBeenCalledTimes(1);
  });

  // `openLocalStore` closes the connection itself when another tab opens a newer
  // schema version. That close has to reach the gate too, or the next operation
  // throws `InvalidStateError` after all (#204).
  it('stops accepting work when the platform closes it for a newer schema version', async () => {
    const db = fakeDb();
    const connection = new LocalStoreConnection(db);
    const outer = vi.fn();
    (db as unknown as { onversionchange: () => void }).onversionchange = outer;

    const reopened = new LocalStoreConnection(db);
    db.onversionchange!({} as IDBVersionChangeEvent);

    expect(reopened.isClosing).toBe(true);
    await expect(reopened.run(async () => 'never', 'skipped')).resolves.toBe('skipped');
    expect(outer).toHaveBeenCalledTimes(1);
    expect(connection.isClosing).toBe(false);
  });
});

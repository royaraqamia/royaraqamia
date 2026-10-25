import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import { LocalStoreMirror, mirrorFor } from '@/frontend/shared/local-store/mirror';

/**
 * #494: the in-memory mirror of a product's rows.
 *
 * It exists so a second surface reads synchronously and so a write paints in
 * the tick it commits. The tests below hold it to the two rules that make that
 * safe: nothing is served before a read hydrated it, and a write only lands in
 * a store that is already mirrored.
 */

function mirror() {
  const filled = new LocalStoreMirror('habitflow__guest', { habits: 'id' });
  return filled;
}

describe('LocalStoreMirror', () => {
  it('serves nothing until a read has hydrated it', () => {
    const rows = mirror();

    expect(rows.has('habits')).toBe(false);
    expect(rows.read('habits')).toBeNull();
    expect(rows.snapshot('habits')).toBeNull();
  });

  it('hydrates from a read and answers synchronously afterwards', () => {
    const rows = mirror();
    rows.fill('habits', [
      { id: 'h-1', name: 'قراءة' },
      { id: 'h-2', name: 'رياضة' },
    ]);

    expect(rows.has('habits')).toBe(true);
    expect(rows.read('habits')).toHaveLength(2);
    expect(rows.snapshot<{ id: string }>('habits')).toEqual([
      { id: 'h-1', name: 'قراءة' },
      { id: 'h-2', name: 'رياضة' },
    ]);
  });

  it('keeps the snapshot identity stable until the rows change', () => {
    const rows = mirror();
    rows.fill('habits', [{ id: 'h-1' }]);

    const first = rows.snapshot('habits');
    expect(rows.snapshot('habits')).toBe(first);

    rows.put('habits', { id: 'h-2' });
    const second = rows.snapshot('habits');
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });

  it('applies one committed write to the mirrored store', () => {
    const rows = mirror();
    rows.fill('habits', [{ id: 'h-1', name: 'قراءة' }]);

    rows.put('habits', { id: 'h-1', name: 'قراءة موسّعة' });
    rows.put('habits', { id: 'h-2', name: 'رياضة' });

    expect(rows.read('habits')).toEqual([
      { id: 'h-1', name: 'قراءة موسّعة' },
      { id: 'h-2', name: 'رياضة' },
    ]);
  });

  it('drops a write to a store nobody has read yet', () => {
    const rows = mirror();
    rows.put('habits', { id: 'h-1' });

    // Caching a fragment of a list would serve a lie; the next read is truth.
    expect(rows.has('habits')).toBe(false);
  });

  it('forgets one store, and everything on a clear', () => {
    const rows = mirror();
    rows.fill('habits', [{ id: 'h-1' }]);
    rows.fill('logs', [{ id: 'l-1' }]);

    rows.drop('habits');
    expect(rows.has('habits')).toBe(false);
    expect(rows.has('logs')).toBe(true);

    rows.clear();
    expect(rows.has('logs')).toBe(false);
  });

  it('notifies subscribers on every change, and stops after unsubscribe', () => {
    const rows = mirror();
    const listener = vi.fn();
    const unsubscribe = rows.subscribe(listener);

    rows.fill('habits', [{ id: 'h-1' }]);
    rows.put('habits', { id: 'h-2' });
    rows.drop('habits');
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    rows.fill('habits', [{ id: 'h-3' }]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('scopes the mirror by factory as well as by database name', () => {
    const one = mirrorFor('habitflow__guest', new IDBFactory(), { habits: 'id' });
    const two = mirrorFor('habitflow__guest', new IDBFactory(), { habits: 'id' });

    one.fill('habits', [{ id: 'h-1' }]);

    // Two factories mean two databases; the second must not see the first's rows.
    expect(two.has('habits')).toBe(false);
  });
});

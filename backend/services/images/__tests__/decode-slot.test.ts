import { describe, expect, it } from 'vitest';

import { imageDecodeStats, withImageDecodeSlot } from '@/backend/services/images/decode-slot';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('withImageDecodeSlot', () => {
  it('never holds two decodes at once', async () => {
    const releaseFirst = deferred<string>();
    const secondStarted = deferred<void>();

    const one = withImageDecodeSlot(async () => {
      await releaseFirst.promise;
      return 'one';
    });
    const two = withImageDecodeSlot(async () => {
      secondStarted.resolve();
      return 'two';
    });

    expect(imageDecodeStats()).toEqual({ active: 1, waiting: 1, peak: 1 });

    releaseFirst.resolve('one');
    await secondStarted.promise;
    expect(imageDecodeStats()).toEqual({ active: 1, waiting: 0, peak: 1 });

    await expect(Promise.all([one, two])).resolves.toEqual(['one', 'two']);
    expect(imageDecodeStats()).toEqual({ active: 0, waiting: 0, peak: 1 });
  });

  it('releases the slot when a decode throws', async () => {
    await expect(
      withImageDecodeSlot(async () => {
        throw new Error('broken');
      })
    ).rejects.toThrow('broken');

    expect(imageDecodeStats()).toEqual({ active: 0, waiting: 0, peak: 1 });
  });
});

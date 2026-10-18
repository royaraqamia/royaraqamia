import { describe, it, expect, vi } from 'vitest';
import { createReadingLine } from '@/frontend/ui/quran/reading-line';

describe('the reading line', () => {
  it('reports the ayah that enters the band', () => {
    const report = vi.fn();
    createReadingLine(report)([{ ayah: 3, isIntersecting: true }]);
    expect(report).toHaveBeenLastCalledWith(3);
  });

  it('keeps the state the observer does not resend', () => {
    // An IntersectionObserver reports changes only, so an ayah that entered in an
    // earlier batch is absent from the next one while still being on the line.
    const report = vi.fn();
    const line = createReadingLine(report);
    line([{ ayah: 3, isIntersecting: true }]);
    line([{ ayah: 4, isIntersecting: true }]);
    line([{ ayah: 4, isIntersecting: false }]);

    expect(report).toHaveBeenLastCalledWith(3);
  });

  it('reports the lowest ayah on the line', () => {
    const report = vi.fn();
    createReadingLine(report)([
      { ayah: 7, isIntersecting: true },
      { ayah: 6, isIntersecting: true },
    ]);
    expect(report).toHaveBeenLastCalledWith(6);
  });

  it('says nothing while no ayah is on the line', () => {
    const report = vi.fn();
    createReadingLine(report)([{ ayah: 1, isIntersecting: false }]);
    expect(report).not.toHaveBeenCalled();
  });
});

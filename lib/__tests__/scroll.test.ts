import { describe, it, expect, vi } from 'vitest';
import { scrollToSection, scrollToTop } from '../scroll';

describe('scroll utilities', () => {
  it('scrollToSection calls window.scrollTo with correct offset', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const el = document.createElement('div');
    el.id = 'test-section';
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ top: 200 }),
    });
    document.body.appendChild(el);

    scrollToSection('test-section');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' });

    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  it('scrollToTop calls window.scrollTo', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    scrollToTop();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    vi.restoreAllMocks();
  });

  it('scrollToSection returns false for non-existent id', () => {
    const result = scrollToSection('non-existent');
    expect(result).toBe(false);
  });

  it('scrollToSection returns true for existing id', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const el = document.createElement('div');
    el.id = 'exists';
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ top: 100 }),
    });
    document.body.appendChild(el);

    const result = scrollToSection('exists');
    expect(result).toBe(true);

    document.body.removeChild(el);
    vi.restoreAllMocks();
  });
});

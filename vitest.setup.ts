import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

HTMLDivElement.prototype.scrollTo = () => {};
HTMLDivElement.prototype.scrollIntoView = () => {};

// Submission receipts live in `localStorage`; clearing both stores between
// tests keeps one test's remembered reference code from leaking into the next.
afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

globalThis.IntersectionObserver = class IntersectionObserver {
  readonly root!: Element | Document | null;
  readonly rootMargin!: string;
  readonly thresholds!: ReadonlyArray<number>;
  constructor() {
    this.root = null;
    this.rootMargin = '';
    this.thresholds = [];
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

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

// jsdom has no `matchMedia`; responsive hooks (`useIsMobile`) and PWA queries
// rely on it. Individual suites may still override it with a controlled mock.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

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

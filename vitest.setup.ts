import '@testing-library/jest-dom';

HTMLDivElement.prototype.scrollTo = () => {};
HTMLDivElement.prototype.scrollIntoView = () => {};

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

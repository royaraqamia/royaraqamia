import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LazySection } from '../LazySection';

const { loadHomeSectionMock } = vi.hoisted(() => {
  const TestSection = () => <div data-testid="loaded-section" />;
  const loadHomeSectionMock = vi.fn(() => Promise.resolve(TestSection));
  return { TestSection, loadHomeSectionMock };
});

vi.mock('../../lazy-sections', () => ({
  HOME_SECTION_IDS: ['portfolio', 'testimonials'],
  HOME_SECTIONS: {},
  loadHomeSection: loadHomeSectionMock,
}));

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  elements = new Set<Element>();
  rootMargin = '';

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '';
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.elements.add(el);
  }

  disconnect() {
    this.elements.clear();
  }

  unobserve() {
    // no-op
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger() {
    const entries = [...this.elements].map(
      (target) =>
        ({
          isIntersecting: true,
          target,
          boundingClientRect: target.getBoundingClientRect(),
        }) as IntersectionObserverEntry
    );
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

const setupStub = globalThis.IntersectionObserver;

describe('LazySection', () => {
  beforeEach(() => {
    loadHomeSectionMock.mockClear();
    FakeIntersectionObserver.instances = [];
    globalThis.IntersectionObserver = setupStub;
  });

  it('loads the section immediately when IntersectionObserver is unavailable', async () => {
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;

    render(<LazySection id="portfolio" />);
    await waitFor(() => expect(screen.getByTestId('loaded-section')).toBeInTheDocument());
    expect(loadHomeSectionMock).toHaveBeenCalledWith('portfolio');
  });

  it('loads the section once the placeholder intersects the viewport', async () => {
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;

    render(<LazySection id="portfolio" />);
    expect(screen.queryByTestId('loaded-section')).not.toBeInTheDocument();
    expect(loadHomeSectionMock).not.toHaveBeenCalled();

    FakeIntersectionObserver.instances[0]?.trigger();
    await waitFor(() => expect(screen.getByTestId('loaded-section')).toBeInTheDocument());
    expect(loadHomeSectionMock).toHaveBeenCalledWith('portfolio');
  });

  it('preloads a section when an in-page anchor pointing to it is clicked', async () => {
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;

    render(<LazySection id="testimonials" />);
    expect(loadHomeSectionMock).not.toHaveBeenCalled();

    const anchor = document.createElement('a');
    anchor.setAttribute('href', '#testimonials');
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    anchor.remove();

    await waitFor(() => expect(loadHomeSectionMock).toHaveBeenCalledWith('testimonials'));
  });
});

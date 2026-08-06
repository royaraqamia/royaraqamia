import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../shared/error-boundary';

const stripTashkeel = (text: string) => text.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, '');

function findByTextIgnoringTashkeel(text: string) {
  const normalized = stripTashkeel(text);
  return screen.getByText(
    (_content: string, node: Element | null) =>
      node !== null && stripTashkeel(node.textContent ?? '').trim() === normalized
  );
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('renders fallback UI on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      throw new Error('test');
    };
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    );
    expect(findByTextIgnoringTashkeel('حدث خطأ غير متوقع')).toBeInTheDocument();
    spy.mockRestore();
  });
});

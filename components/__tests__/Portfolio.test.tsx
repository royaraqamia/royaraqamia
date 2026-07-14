import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Portfolio } from '../Portfolio';

vi.mock('../../hooks/useHorizontalScroll', () => ({
  useHorizontalScroll: () => ({
    scrollContainerRef: { current: null },
    canScrollLeft: false,
    canScrollRight: false,
    scroll: () => {},
  }),
}));

describe('Portfolio', () => {
  it('renders the section heading', () => {
    render(<Portfolio />);
    expect(screen.getByText('نبذة عن')).toBeInTheDocument();
    expect(screen.getByText('أعمالنا')).toBeInTheDocument();
  });

  it('renders portfolio images', () => {
    render(<Portfolio />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);
  });

  it('marks the gallery region', () => {
    render(<Portfolio />);
    expect(screen.getByLabelText('معرض الأعمال')).toBeInTheDocument();
  });
});

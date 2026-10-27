import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

describe('Hero', () => {
  it('renders the main headline', () => {
    render(<Hero />);
    expect(screen.getByText('شريكك الاستراتيجي')).toBeInTheDocument();
  });

  it('names today’s Hijri date above the headline', () => {
    const { container } = render(<Hero />);
    const date = container.querySelector('[data-hijri-today]');
    const heading = screen.getByRole('heading', { level: 1 });

    expect(date).not.toBeNull();
    expect(date).toHaveTextContent(/هـ$/);
    // Precedes the headline in document order, i.e. sits above it.
    expect(date!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the browse-services CTA that opens the services menu', () => {
    render(<Hero />);
    const trigger = screen.getByRole('button', { name: /تصفَّح خدماتنا/ });
    expect(trigger).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<Hero />);
    expect(screen.getByText(/نبني منتجات/)).toBeInTheDocument();
  });
});

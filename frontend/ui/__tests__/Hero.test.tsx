import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

describe('Hero', () => {
  it('renders the main headline', () => {
    render(<Hero />);
    expect(screen.getByText('شريكك الاستراتيجي')).toBeInTheDocument();
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

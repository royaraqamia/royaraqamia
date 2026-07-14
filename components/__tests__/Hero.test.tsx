import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

describe('Hero', () => {
  it('renders the main headline', () => {
    render(<Hero />);
    expect(screen.getByText('شريكك الاستراتيجي')).toBeInTheDocument();
  });

  it('renders the CTA button with WhatsApp link', () => {
    render(<Hero />);
    const link = screen.getByText('تواصل معنا الآن');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('wa.me'));
  });

  it('renders the description text', () => {
    render(<Hero />);
    expect(screen.getByText(/نبني مواقع إلكترونيَّة وتطبيقات/)).toBeInTheDocument();
  });

  it('renders the badge', () => {
    render(<Hero />);
    expect(screen.getByText('ابدأ رحلتك الرَّقميَّة')).toBeInTheDocument();
  });
});

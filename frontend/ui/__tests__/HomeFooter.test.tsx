import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeFooter } from '../HomeFooter';

describe('HomeFooter', () => {
  it('keeps the three legal links on the homepage', () => {
    render(<HomeFooter />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الخصوصيَّة' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'الشُّروط' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'الأمان' })).toHaveAttribute('href', '/security');
  });

  it('leaves the brand line and the social icons to the account footer', () => {
    render(<HomeFooter />);

    expect(screen.queryByText('رؤيَة رقَميَّة')).not.toBeInTheDocument();
    expect(screen.queryByText(/جميع الحقوق محفوظة/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تابعنا على Telegram')).not.toBeInTheDocument();
  });
});

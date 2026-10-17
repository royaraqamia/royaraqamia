import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

describe('Footer', () => {
  it('renders the footer', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('carries the copyright line and the social icons, and no logo', () => {
    render(<Footer />);

    expect(screen.getByText('رؤيَة رقَميَّة')).toBeInTheDocument();
    expect(screen.getByText(/جميع الحقوق محفوظة/)).toBeInTheDocument();

    for (const label of ['Telegram', 'Instagram', 'LinkedIn']) {
      expect(screen.getByRole('link', { name: `تابعنا على ${label}` })).toBeInTheDocument();
    }

    // The brand button and the contact pills stayed on the homepage's footer.
    expect(screen.queryByRole('link', { name: /contact@royaraqamia/ })).not.toBeInTheDocument();
    expect(screen.queryByText('حَلَب، سوريا')).not.toBeInTheDocument();
  });
});

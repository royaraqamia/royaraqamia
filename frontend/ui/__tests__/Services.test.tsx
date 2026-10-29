import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Services } from '../Services';
import { UIProvider } from '../../state/UIContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(<UIProvider>{ui}</UIProvider>);
}

/** Every visible entry of the `خدماتنا` menu, in the menu's own order. */
const MENU_ENTRIES: [name: string, href: string][] = [
  ['طلب بناء مشروع', '/request-project'],
  ['طلب التَّعاقُد الشَّهري', '/hire'],
  ['أخبار اليوم', '/news'],
  ['التَّسجيل في التَّدريب', '/training/apply'],
  ['التَّحقُّق من الشَّهادة', '/verify'],
  ['حجز استشارة', '/consultation/book'],
  ['أسعار الصَّرف', '/rates'],
  ['مُنزِّل الوسائط', '/downloader'],
  ['ماسح QR و Barcode', '/scan'],
  ['القرآن الكريم', '/quran'],
  ['أذكار الصَّباح والمساء', '/athkar'],
  ['اختصار الرَّوابط', '/linksnap'],
  ['تتبُّع العادات', '/habitflow'],
  ['تتبُّع المصاريف', '/spendtrack'],
  ['الملاحظات', '/notes'],
  ['ربط الـ MCP', '/mcp/guide'],
];

describe('Services', () => {
  it('renders the section heading', () => {
    renderWithProviders(<Services />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/ماذا/);
    expect(heading).toHaveTextContent(/نُقدِّم/);
  });

  it('lists every service from the خدماتنا menu as its own link', () => {
    renderWithProviders(<Services />);

    for (const [name, href] of MENU_ENTRIES) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(MENU_ENTRIES.length);
  });

  it('shows no feature list and no separate CTA button', () => {
    renderWithProviders(<Services />);

    expect(screen.queryByText('قراءة المزيد')).not.toBeInTheDocument();
    expect(screen.queryByText('بناء متكامل من الألف إلى الياء')).not.toBeInTheDocument();
  });
});

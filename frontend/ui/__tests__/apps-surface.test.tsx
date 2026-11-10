import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { AppsSurface } from '../apps/apps-surface';
import type { AppsTab } from '@/shared/contracts/mcp-marketplace';
import type { NavLink } from '../navbar/NavDropdown';

const SUB_ITEMS: NavLink[] = [
  { href: '/quran', label: 'القرآن الكريم', isRoute: true },
  { href: '/athkar', label: 'أذكار الصباح والمساء', isRoute: true },
];

function StubStore({ query }: { query: string; connect: string | null }) {
  return <p>store:{query}</p>;
}

function StubInbound({ query }: { query: string }) {
  return <p>inbound:{query}</p>;
}

function SheetHarness() {
  const [tab, setTab] = useState<AppsTab>('internal');

  return (
    <AppsSurface
      host="sheet"
      tab={tab}
      subItems={SUB_ITEMS}
      onTabChange={setTab}
      StoreTab={StubStore}
      InboundTab={StubInbound}
    />
  );
}

afterEach(cleanup);

describe('AppsSurface — the three tabs', () => {
  it('draws our apps, the marketplace and the clients on our MCP server', () => {
    render(<SheetHarness />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'تطبيقاتنا',
      'تطبيقات خارجيَّة',
      'الـ MCP الخاص بنا',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('القرآن الكريم')).toBeInTheDocument();
  });

  it('filters our own rows from the one search box', () => {
    render(<SheetHarness />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'القرآن' } });

    expect(screen.getByText('القرآن الكريم')).toBeInTheDocument();
    expect(screen.queryByText('أذكار الصباح والمساء')).not.toBeInTheDocument();
  });

  it('starts the next tab with an empty search', () => {
    render(<SheetHarness />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'القرآن' } });
    fireEvent.click(screen.getByRole('tab', { name: 'تطبيقات خارجيَّة' }));

    expect(screen.getByText('store:')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('carries the query into the clients tab', () => {
    render(<SheetHarness />);

    fireEvent.click(screen.getByRole('tab', { name: 'الـ MCP الخاص بنا' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Claude' } });

    expect(screen.getByText('inbound:Claude')).toBeInTheDocument();
  });
});

describe('AppsSurface — the page host', () => {
  it('makes each tab an address instead of a state', () => {
    render(
      <AppsSurface
        host="page"
        tab="internal"
        subItems={SUB_ITEMS}
        tabHref={(tab) => (tab === 'external' ? '/mcp/apps' : `/mcp/apps?tab=${tab}`)}
        StoreTab={StubStore}
        InboundTab={StubInbound}
      />
    );

    expect(screen.getByRole('link', { name: 'تطبيقاتنا' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'تطبيقات خارجيَّة' })).toHaveAttribute(
      'href',
      '/mcp/apps'
    );
    expect(screen.getByRole('link', { name: 'الـ MCP الخاص بنا' })).toHaveAttribute(
      'href',
      '/mcp/apps?tab=inbound'
    );
  });
});

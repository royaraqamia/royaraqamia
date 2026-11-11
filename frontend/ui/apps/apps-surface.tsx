'use client';

import { useState, type ComponentType } from 'react';
import { Search } from 'lucide-react';

import { APPS_TABS, type AppsTab } from '@/shared/contracts/mcp-marketplace';
import { TabChips, TabChipsNav } from '@/frontend/ui/primitives/tab-chips';
import { ServicesMenuItems } from '@/frontend/ui/navbar/ServicesMenuItems';
import { useSession } from '@/frontend/state/session-provider';

import { APPS_SURFACE_COPY as COPY } from './apps-copy';

import type { NavLink } from '@/frontend/ui/navbar/NavDropdown';

/** The marketplace panel, loaded by whichever host can afford it. */
export type StoreTabComponent = ComponentType<{ query: string; connect: string | null }>;

/** The clients-connected-to-us panel, same contract. */
export type InboundTabComponent = ComponentType<{ query: string }>;

interface AppsSurfaceProps {
  /** A page scrolls as a document; a sheet gives the body its own scroll area. */
  host: 'page' | 'sheet';
  tab: AppsTab;
  subItems?: NavLink[];
  connect?: string | null;
  onTabChange?: (tab: AppsTab) => void;
  /** The page's tabs are links; the sheet's are buttons. */
  tabHref?: (tab: AppsTab) => string;
  StoreTab: StoreTabComponent;
  InboundTab: InboundTabComponent;
}

const TAB_LABELS: Record<AppsTab, string> = {
  internal: COPY.tabInternal,
  external: COPY.tabExternal,
  inbound: COPY.tabInbound,
};

const TAB_PLACEHOLDERS: Record<AppsTab, string> = {
  internal: COPY.searchInternal,
  external: COPY.searchExternal,
  inbound: COPY.searchInbound,
};

/**
 * The one apps surface (ADR-0146, ADR-0155).
 *
 * Three tabs — our apps, the external marketplace, and the clients connected
 * to our MCP server — over one search box that belongs to the active tab. The
 * sheet and the page both render this component, so the two hosts cannot drift
 * apart; only the tab control differs, because a page tab is a URL and a sheet
 * tab is a state.
 *
 * The chips, their scroller and the active look come from `TabChips`: one
 * pattern for every view switcher on the site.
 *
 * The panels are passed in rather than imported: the page can afford them in
 * its own bundle, while the sheet loads each on first activation so opening it
 * stays as cheap as it is today.
 */
export function AppsSurface({
  host,
  tab,
  subItems,
  connect = null,
  onTabChange,
  tabHref,
  StoreTab,
  InboundTab,
}: AppsSurfaceProps) {
  const [query, setQuery] = useState('');
  const [renderedTab, setRenderedTab] = useState(tab);
  const { user, isLoading } = useSession();

  // The two MCP tabs answer a signed-out visitor with a sign-in card, so a
  // search box over nothing is a control that cannot work. Ours works signed
  // out, because the picker does.
  const showSearch = tab === 'internal' || isLoading || Boolean(user);

  // A tab change starts a new search. Adjusting during render is the documented
  // way to reset state from a prop without an extra paint of the old answer.
  if (tab !== renderedTab) {
    setRenderedTab(tab);
    setQuery('');
  }

  const tabItems = APPS_TABS.map((id) => ({ id, label: TAB_LABELS[id] }));

  const tabs =
    host === 'page' ? (
      <TabChipsNav
        label={COPY.tabsLabel}
        items={tabItems}
        activeId={tab}
        href={(id) => tabHref?.(id as AppsTab) ?? '/mcp/apps'}
      />
    ) : (
      <TabChips
        label={COPY.tabsLabel}
        items={tabItems}
        activeId={tab}
        onSelect={(id) => onTabChange?.(id as AppsTab)}
        idPrefix="apps"
        panelId="apps-panel"
      />
    );

  const search = (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={TAB_PLACEHOLDERS[tab]}
        aria-label={COPY.searchLabel}
        className="w-full rounded-xl border border-border/60 bg-card/70 py-2.5 pe-3 ps-9 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      />
    </div>
  );

  const panel =
    tab === 'internal' ? (
      <ServicesMenuItems subItems={subItems} query={query} />
    ) : tab === 'external' ? (
      <StoreTab query={query} connect={connect} />
    ) : (
      <InboundTab query={query} />
    );

  if (host === 'sheet') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-2 border-b border-border/40 px-3 pt-3 pb-3">
          {tabs}
          {showSearch && search}
        </div>
        <div
          id="apps-panel"
          role="tabpanel"
          aria-labelledby={`apps-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dialog-scrollbar"
        >
          {panel}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {tabs}
      {showSearch && search}
      <div>{panel}</div>
    </div>
  );
}

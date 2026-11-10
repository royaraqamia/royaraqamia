import { redirect } from 'next/navigation';

/**
 * The old home of the inbound list (ADR-0155, decision 10).
 *
 * The list was never wrong — its address was. It is now the first tab of
 * `/mcp/apps`, so this page keeps its URL and keeps resolving for the account
 * row, a bookmark and the app's screen table, and sends the reader to the tab
 * that renders the same list. A tab that teleported elsewhere would be the
 * worse answer; a redirect nobody sees is the better one.
 */
export default function AccountConnectedAppsPage() {
  redirect('/mcp/apps?tab=inbound');
}

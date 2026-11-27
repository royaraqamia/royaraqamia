import { AssistantHomeView } from '@/frontend/ui/assistant/assistant-home-view';

/**
 * `/assistant`: the member's own assistant page (ADR-0224).
 *
 * A data-free shell — the read and the guard live in the client view — rendered
 * per request because the page is per-member. The document itself carries no
 * member data, so the worker may cache the frame; the identity never leaves the
 * `no-store` API it is read from.
 */
export const dynamic = 'force-dynamic';

export default function AssistantPage() {
  return <AssistantHomeView />;
}

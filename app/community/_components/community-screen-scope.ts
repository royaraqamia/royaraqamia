import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What the community surfaces register while they are on screen (ADR-0181, #1421).
 *
 * The feed has one thing the route cannot name: which feed it is. `/community`
 * draws the member's own following feed and `/community/explore` the public hub,
 * and the island knows which one it is drawing — the two read different routes,
 * one per-viewer and one a shared document.
 *
 * A post is the record in hand, by id and never by body. The id is what a
 * follow-up turn needs ("what else did this member write?"); the words are the
 * page the member is already looking at, and the surface's policy publishes no
 * text, so another member's writing cannot ride into a prompt.
 *
 * The composer is a dialog holding text nobody has sent. Its draft is handed over
 * as a candidate and the policy refuses it, the way the notes editor's body is
 * refused: an unsent draft is invisible by decision, not by an accident of what
 * the component happened to pass (#1419, ADR-0181 decision 4).
 */

/** Which feed the island is drawing: the member's own, or the public hub. */
export type CommunityFeedSource = 'following' | 'index';

export function communityFeedScope(source: CommunityFeedSource): ScreenScope {
  return { id: 'community.feed', kind: 'screen', tab: source };
}

export function communityPostScope(postId: string): ScreenScope {
  return { id: 'community-post.page', kind: 'screen', focus: { kind: 'post', id: postId } };
}

/**
 * The composer, while it is open.
 *
 * `postId` is the post being edited, so a member asking about the editor on a
 * published post is asking about that record; a new post has none yet, and the
 * dialog still names itself.
 */
export function communityComposerScope(
  open: boolean,
  body: string,
  postId?: string | null
): ScreenScope | null {
  if (!open) return null;
  return {
    id: 'community.composer',
    kind: 'dialog',
    focus: postId ? { kind: 'post', id: postId } : null,
    fields: [{ name: 'body', value: body }],
    text: body,
  };
}

/**
 * Can this viewer open this member's profile page?
 *
 * A hidden member (ADR-0127) does not exist for the public: the roster, the
 * member search and the sitemap already skip the row, and the profile route
 * answers 404 so a direct link says the same thing. Two viewers are exempt,
 * because neither is "the public":
 *
 * - the member itself, which is a signed-in account like any other and must
 *   keep seeing its own profile while it is used;
 * - an Admin, who needs to check what a hidden row looks like without reading
 *   the database by hand.
 *
 * The predicate is pure so the exemption is decided in one place and tested
 * without a request: an anonymous viewer is `{ id: null, isAdmin: false }`.
 */
export interface MemberVisibility {
  id: string;
  is_hidden: boolean;
}

export interface MemberViewer {
  /** The signed-in account, or null when nobody is signed in. */
  id: string | null;
  /** The `ADMIN_EMAILS` allowlist predicate (ADR-0003), already resolved. */
  isAdmin: boolean;
}

export function canViewMember(member: MemberVisibility, viewer: MemberViewer): boolean {
  if (!member.is_hidden) return true;
  return viewer.id === member.id || viewer.isAdmin;
}

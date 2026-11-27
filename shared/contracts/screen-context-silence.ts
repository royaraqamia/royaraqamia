/**
 * The surfaces that publish nothing, and the reason each one does (ADR-0181,
 * decisions 4, 5 and 8; #1421).
 *
 * ADR-0181 decision 2 makes a route visible without a registration, and this
 * list is the other half of that sentence: every surface either registers what a
 * turn should see, or is written down here as a decision not to. `npm run
 * check:screens` reads this file and fails a surface that is in neither, so a
 * new screen is a visible gap rather than a silent one.
 *
 * It is a separate module because only the check and its fixture read it: the
 * reasons are prose, and a page's bundle has no use for prose (the client-side
 * opt-out is the one blind surface in `screens.ts`).
 *
 * Nothing here is a verdict for good. A row moves to a registration the day the
 * surface has state a member would ask about; the reason says what that state
 * would have to be.
 */
export const SCREEN_CONTEXT_SILENT_SURFACES: Readonly<Record<string, string>> = {
  assistant: 'A settings form: the turn already receives it as identity data.',
  admin: 'An operator screen publishes nothing at all (ADR-0181 decision 8).',
  auth: 'An auth screen is never observed: its fields are the credential itself.',
  chats: 'A thread is its body, and a message body is denied by policy; a turn asks instead.',
  coding: 'Per-member task state and diffs are exposed through نور tools, not screen context.',
  consultation: "A booking form is the member's own words, unsent until they send it.",
  home: 'The hub is a launcher: it draws links to the nine apps, not state.',
  leads: "A lead form is a message to the owner, and its body is the member's words.",
  marketing: 'Five static pages whose words are the deliverable (ADR-0178).',
  'mcp-app-detail': 'A catalogue row, public and cached: a route and a title are the answer.',
  'mcp-apps': 'The catalogue is public and cached, and a turn reads it through a tool.',
  'mcp-connect': 'An OAuth consent screen: the thing on it is a token.',
  'mcp-guide': 'Documentation: the words are the subject, and a tool reads them.',
  notifications: "A list of the member's own events, read through a tool when asked.",
  profile: 'A public profile describes another member, which the eyes never do.',
  verify: 'The verification landing is a form whose field is the credential.',
  'verify-code': 'The code is a credential, and the surface holds nothing else.',
};

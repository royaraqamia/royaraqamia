import { CHAT_THREAD_COPY } from './chat-thread-copy';

/**
 * The header's words, passed to the line rather than read by it, so the site's
 * reference component remains the one that renders every key its copy source
 * declares (checked by `npm run check:parity`). One sentence, one file.
 */
export interface LastSeenLabels {
  onlineNow: string;
  assistantOnline: string;
  lastSeenToday: string;
  lastSeenYesterday: string;
  lastSeenOn: string;
}

export const LAST_SEEN_LABELS: LastSeenLabels = {
  onlineNow: CHAT_THREAD_COPY.onlineNow,
  assistantOnline: CHAT_THREAD_COPY.assistantOnline,
  lastSeenToday: CHAT_THREAD_COPY.lastSeenToday,
  lastSeenYesterday: CHAT_THREAD_COPY.lastSeenYesterday,
  lastSeenOn: CHAT_THREAD_COPY.lastSeenOn,
};

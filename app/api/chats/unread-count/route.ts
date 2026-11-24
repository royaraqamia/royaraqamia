import { getChatUnreadCount } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The Chats tab badge's own read. The bell's page asks for this number without
 * opening the list, so a member who never opens Chats pays one aggregate
 * instead of a full conversation read (#1803).
 */
export async function GET() {
  return toNextResponse(await getChatUnreadCount());
}

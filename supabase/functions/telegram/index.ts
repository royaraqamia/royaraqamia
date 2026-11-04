/**
 * The Telegram webhook: store the update, wake the workflow, answer 200.
 *
 * Telegram pushes here the moment something happens, which is the only way to
 * get a reply in seconds without polling. This function never calls a model and
 * never answers a question: the work stays in `.github/workflows/telegram.yml`,
 * where the repository, the skills and the shell are.
 *
 * It does own three things the runner cannot, because they arrive as an HTTP
 * request that Telegram wants answered within seconds:
 *
 *   - a message (text, voice note, picture, document) is stored and dispatched;
 *   - a button press is recorded and answered, and only a *second* merge tap
 *     dispatches the merge itself;
 *   - a reaction is recorded as feedback on the answer it refers to.
 *
 * Why it stores before it dispatches: a dispatch can fail (GitHub is down, the
 * Vault PAT was rotated). If the update were only forwarded, that message would
 * be lost. Storing it first means the five-minute backstop finds the row.
 * `update_id` is unique, so Telegram's own retry is a no-op rather than a second
 * answer.
 *
 * Answering 200 is deliberate even when an update is ignored: any 4xx makes
 * Telegram retry the same update for up to 24 hours. A wrong secret is the one
 * exception - that is not Telegram.
 *
 * Deploy:
 *   supabase functions deploy telegram --no-verify-jwt
 * Secrets (Dashboard > Edge Functions > Secrets, or `supabase secrets set`):
 *   TELEGRAM_WEBHOOK_SECRET  the value passed to setWebhook's secret_token
 *   TELEGRAM_CHAT_ID         the only chat allowed to use the bot
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */

const reply = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

interface TelegramMessage {
  chat?: { id?: number };
  text?: string;
  caption?: string;
  voice?: { file_id?: string; duration?: number };
  audio?: { file_id?: string; duration?: number };
  photo?: { file_id?: string; file_size?: number }[];
  document?: { file_id?: string; file_name?: string };
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id?: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
  };
  message_reaction?: {
    chat?: { id?: number };
    message_id?: number;
    new_reaction?: { type?: string; emoji?: string }[];
  };
}

const REACTION_FEEDBACK: Record<string, string> = {
  '👍': 'up',
  '👎': 'down',
  '💔': 'down',
  '🤔': 'unsure',
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply('ok');

  const expected = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
  const presented = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!expected || presented !== expected) return reply('forbidden', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!supabaseUrl || !serviceKey) return reply('misconfigured', 500);

  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return reply('ok');
  }

  const allowed = (id?: number) => !chatId || String(id ?? '') === String(chatId);
  const dispatch = (inputs: Record<string, string>) =>
    fetch(`${supabaseUrl}/rest/v1/rpc/dispatch_github_workflow`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_workflow: 'telegram.yml', p_ref: 'main', p_inputs: inputs }),
    });

  // The button's own feedback: a tap with no visible change reads as a broken
  // button, so the message is edited in place and the spinner dismissed.
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const telegram = async (method: string, payload: Record<string, unknown>) => {
    if (!botToken) return;
    await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const patchMessage = (filter: string, patch: Record<string, unknown>) =>
    fetch(`${supabaseUrl}/rest/v1/telegram_messages?${filter}`, {
      method: 'PATCH',
      headers: { ...headers, prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });

  // ------------------------------------------------------------ a button press
  const callback = update.callback_query;
  if (callback) {
    const chat = callback.message?.chat?.id;
    if (!allowed(chat)) return reply('ok');

    const data = String(callback.data ?? '');
    const [kind, value] = data.split(':');
    const callbackId = callback.id ?? '';
    const targetMessage = callback.message?.message_id;

    await telegram('answerCallbackQuery', { callback_query_id: callbackId });

    const rewrite = (text: string, markup?: Record<string, unknown>) => {
      if (!targetMessage) return Promise.resolve();
      return telegram('editMessageText', {
        chat_id: chat,
        message_id: targetMessage,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(markup ? { reply_markup: markup } : {}),
      });
    };

    // Exactly once: Telegram redelivers a callback query when this function is
    // slow, and a second delivery of a merge tap must not merge twice.
    if (callbackId) {
      const seen = await fetch(`${supabaseUrl}/rest/v1/telegram_callbacks`, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({
          callback_id: callbackId,
          chat_id: chat,
          message_id: callback.message?.message_id ?? null,
          data,
        }),
      });
      const rows = await seen.json().catch(() => []);
      if (Array.isArray(rows) && rows.length === 0) return reply('ok');
    }

    if (kind === 'stop' && value) {
      await patchMessage(`id=eq.${value}&direction=eq.in`, { cancel_requested: true });
      await rewrite('أوقفت العمل. سيتوقف عند أول خطوة تالية، وأخبرك.');
      return reply('ok');
    }

    if (kind === 'merge' && value) {
      // First tap: whatever the row says, the only thing it may do is move to
      // step two. The merge is dispatched by `merge2`, below.
      const found = await fetch(
        `${supabaseUrl}/rest/v1/telegram_confirmations?id=eq.${value}&completed_at=is.null&select=id,step,expires_at,kind,target`,
        { headers }
      );
      const rows = await found.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      const live = row && new Date(row.expires_at).getTime() > Date.now();
      if (!live) {
        await rewrite('انتهت صلاحية هذا التأكيد، ولم يُدمج شيء. اطلب الدمج من جديد.');
        return reply('ok');
      }

      await fetch(`${supabaseUrl}/rest/v1/telegram_confirmations?id=eq.${value}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ step: 2 }),
      });
      await rewrite(
        `أكّد الدمج النهائي لـ <a href="https://github.com/royaraqamia/royaraqamia/pull/${row.target}">#${row.target}</a> في main:`,
        {
          inline_keyboard: [[{ text: 'تأكيد الدمج النهائي', callback_data: `merge2:${value}` }]],
        }
      );
      return reply('ok');
    }

    if (kind === 'merge2' && value) {
      // Second tap: dispatch the run that merges. The runner re-reads the row
      // and refuses anything that is not step two and still live.
      const found = await fetch(
        `${supabaseUrl}/rest/v1/telegram_confirmations?id=eq.${value}&completed_at=is.null&select=id,step,expires_at`,
        { headers }
      );
      const rows = await found.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      const live = row && row.step >= 2 && new Date(row.expires_at).getTime() > Date.now();
      if (!live) {
        await rewrite('انتهت صلاحية هذا التأكيد، ولم يُدمج شيء. اطلب الدمج من جديد.');
        return reply('ok');
      }

      await dispatch({ mode: 'merge', confirmation: String(value) });
      await rewrite('جاري الدمج… أخبرك بالنتيجة.');
      return reply('ok');
    }

    return reply('ok');
  }

  // ---------------------------------------------------------------- a reaction
  const reaction = update.message_reaction;
  if (reaction) {
    const chat = reaction.chat?.id;
    if (!allowed(chat) || !reaction.message_id) return reply('ok');

    const emoji = (reaction.new_reaction ?? []).find((item) => item.type === 'emoji')?.emoji ?? '';
    const feedback = REACTION_FEEDBACK[emoji] ?? '';
    if (!feedback) return reply('ok');

    await patchMessage(`telegram_message_id=eq.${reaction.message_id}`, { feedback });
    return reply('ok');
  }

  // ------------------------------------------------------------------ a message
  const message = update.message ?? update.edited_message;
  if (!message) return reply('ok');

  const from = message.chat?.id;
  const text = (message.text ?? message.caption ?? '').trim();
  const voice = message.voice ?? message.audio;
  const photo = message.photo?.[message.photo.length - 1];
  const document = message.document;

  if (!update.update_id || !from) return reply('ok');
  if (!text && !voice?.file_id && !photo?.file_id && !document?.file_id) return reply('ok');
  if (!allowed(from)) return reply('ok');

  const stored = await fetch(`${supabaseUrl}/rest/v1/telegram_messages?on_conflict=update_id`, {
    method: 'POST',
    headers: { ...headers, prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      chat_id: from,
      update_id: update.update_id,
      direction: 'in',
      // A row needs words: an attachment with no caption still has to say what
      // arrived, or the log reads as an empty message that was answered.
      body: text || (voice ? '🎙️' : photo ? '📷' : '📎'),
      voice_file_id: voice?.file_id ?? null,
      voice_duration: voice?.duration ?? null,
      photo_file_id: photo?.file_id ?? null,
      document_file_id: document?.file_id ?? null,
    }),
  });

  if (!stored.ok) {
    // A failed write must fail loudly: a 500 makes Telegram retry, which is the
    // only thing that keeps the message from being lost.
    return reply(await stored.text(), 500);
  }

  const rows = await stored.json();
  if (!Array.isArray(rows) || rows.length === 0) return reply('ok'); // already stored

  const dispatched = await dispatch({ mode: 'drain' });
  if (!dispatched.ok) {
    // The row is stored, so the five-minute backstop still runs it; the 500 lets
    // Telegram retry the dispatch immediately as well.
    return reply(await dispatched.text(), 500);
  }

  return reply('ok');
});

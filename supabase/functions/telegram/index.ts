/**
 * The Telegram webhook: store the update, wake the workflow, answer 200.
 *
 * Telegram pushes here the moment a message is sent, which is the only way to
 * get a reply in seconds without polling. That is all this function does - it
 * never calls a model and never files an issue. The work stays in
 * `.github/workflows/telegram.yml`, which owns the allowed chat, the routing and
 * the issue creation; this function is a doorbell.
 *
 * Why it stores before it dispatches: a dispatch can fail (GitHub is down, the
 * Vault PAT was rotated). If the update were only forwarded, that message would
 * be lost. Storing it first means the fifteen-minute backstop finds the row and
 * the work still happens. `update_id` is unique, so a Telegram retry of the same
 * update is a no-op rather than a second issue.
 *
 * Answering 200 is deliberate even when the update is ignored: any 4xx makes
 * Telegram retry the same update for up to 24 hours. A wrong secret is the one
 * exception - that is not Telegram, and the answer should say so.
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

  let update: {
    update_id?: number;
    message?: { chat?: { id?: number }; text?: string };
    edited_message?: { chat?: { id?: number }; text?: string };
  };
  try {
    update = await request.json();
  } catch {
    return reply('ok');
  }

  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const from = message?.chat?.id;

  // Anything that is not a text message from the one allowed chat is dropped
  // with a 200, so Telegram stops trying and the log stays readable.
  if (!update.update_id || !from || !text) return reply('ok');
  if (chatId && String(from) !== String(chatId)) return reply('ok');

  const stored = await fetch(`${supabaseUrl}/rest/v1/telegram_messages?on_conflict=update_id`, {
    method: 'POST',
    headers: { ...headers, prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      chat_id: from,
      update_id: update.update_id,
      direction: 'in',
      body: text,
    }),
  });

  if (!stored.ok) {
    // A failed write must fail loudly: a 500 makes Telegram retry, which is the
    // only thing that keeps the message from being lost.
    return reply(await stored.text(), 500);
  }

  const rows = await stored.json();
  if (!Array.isArray(rows) || rows.length === 0) return reply('ok'); // already stored

  const dispatched = await fetch(`${supabaseUrl}/rest/v1/rpc/dispatch_github_workflow`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_workflow: 'telegram.yml', p_ref: 'main' }),
  });

  if (!dispatched.ok) {
    // The row is stored, so the fifteen-minute backstop still runs it; the 500
    // lets Telegram retry the dispatch immediately as well.
    return reply(await dispatched.text(), 500);
  }

  return reply('ok');
});

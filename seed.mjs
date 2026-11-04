/**
 * Inserts one labelled test message the bot will answer, and prints its id.
 * Deleted again by `cleanup.mjs`; nothing else touches the table.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) process.env[match[1]] ??= match[2].replace(/^"|"$/g, "");
}

const url = process.env.SUPABASE_URL.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
};

const body =
  process.argv[2] ??
  "اقرأ AGENTS.md واذكر أول قاعدتين في العقد، ثم قل كم ملفاً في scripts/telegram.";
const updateId = Number(process.argv[3] ?? 999000001);

const response = await fetch(`${url}/rest/v1/telegram_messages`, {
  method: "POST",
  headers: { ...headers, prefer: "return=representation" },
  body: JSON.stringify({
    chat_id: Number(process.env.TELEGRAM_CHAT_ID || 639679230),
    update_id: updateId,
    direction: "in",
    body,
  }),
});

const rows = await response.json();
if (!response.ok) {
  console.error(response.status, JSON.stringify(rows).slice(0, 400));
  process.exit(1);
}
console.log(JSON.stringify({ id: rows[0].id, update_id: updateId, body }));

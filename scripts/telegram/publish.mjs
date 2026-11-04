/**
 * Turning a run that changed files into something reviewable.
 *
 * The agent edits the working tree and stops there. Everything with a
 * permanent consequence - the branch, the commit, the push, the pull request -
 * happens here, in code with an obvious read order, so "never push to main" is
 * a property of this file rather than a sentence in a prompt. The merge itself
 * is not here either: it waits for two taps (see `merge.mjs`).
 */

import { execFileSync } from 'node:child_process';

import { githubTarget } from './config.mjs';
import { github } from './http.mjs';
import { openConfirmation } from './store.mjs';
import { sendMarkdown } from './progress.mjs';

const LABEL = 'telegram';

/** Any change at all, including a new file. */
export function hasChanges(cwd) {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

export function slug(text, limit = 40) {
  const words = String(text ?? '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');
  return (words || 'change').slice(0, limit).replace(/-+$/g, '') || 'change';
}

/**
 * The token that pushes, and the token that reads.
 *
 * A push or a pull request made with the workflow's own `GITHUB_TOKEN` starts no
 * workflow, so the checks the owner insists on before a merge would never run on
 * the bot's branch - the same reason `pr-land.yml` repairs with
 * `AGENT_PUSH_TOKEN`. Reads and the merge stay on `GITHUB_TOKEN`.
 */
function pushToken() {
  return process.env.AGENT_PUSH_TOKEN || process.env.GITHUB_TOKEN || '';
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function ensureLabel(owner, repo) {
  await github(`/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({
      name: LABEL,
      color: '1d76db',
      description: 'Filed by the Telegram bot',
    }),
  }).catch(() => {
    // 422 when it already exists, which is the normal case after the first day.
  });
}

/**
 * Files the record of the request.
 *
 * It is labelled `telegram`, not `ready-for-agent`: the owner's rule is that
 * work the bot did itself waits for their two confirmations, while the
 * unattended pipeline keeps merging its own green pull requests (ADR 0120).
 * Handing it `ready-for-agent` would hand it to that pipeline and skip the taps.
 */
export async function fileIssue({ owner, repo, title, body }) {
  await ensureLabel(owner, repo);
  return github(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: `[telegram] ${title}`, body, labels: [LABEL] }),
  });
}

/**
 * Publishes the working tree as a pull request and returns the message that
 * carries the two merge buttons.
 */
export async function publishWork({ cwd, messageRowId, requestText, answer, runUrl }) {
  const { owner, repo } = githubTarget();
  const titleLine =
    String(requestText ?? '')
      .trim()
      .split('\n')[0] || 'تغيير من تيليجرام';
  const title = titleLine.slice(0, 120);
  const branch = `telegram/${messageRowId ?? Date.now()}-${slug(title)}`;

  const issue = await fileIssue({
    owner,
    repo,
    title,
    body: [
      `الطلب كما وصل: ${requestText}`,
      '',
      '## ما فعله المساعد',
      '',
      answer,
      runUrl ? `\n[سجل التشغيل](${runUrl})` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  git(cwd, ['checkout', '-B', branch]);
  git(cwd, ['add', '--all']);
  git(cwd, [
    '-c',
    'user.name=Telegram Bot',
    '-c',
    'user.email=bot@royaraqamia.invalid',
    'commit',
    '-m',
    `${title} (#${issue?.number ?? '?'})`,
    '-m',
    `Filed from Telegram as #${issue?.number ?? '?'}.`,
  ]);

  // The checkout ran with `persist-credentials: false`, so the token has to be
  // part of the remote for this one command - and it must be the PAT, or the
  // branch arrives without a single check running on it.
  const remote = `https://x-access-token:${pushToken()}@github.com/${owner}/${repo}.git`;
  git(cwd, ['push', remote, `HEAD:refs/heads/${branch}`]);

  const pull = await github(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        head: branch,
        base: 'main',
        body: [
          `Closes #${issue?.number ?? ''}`.trim(),
          '',
          '## Why',
          '',
          requestText,
          '',
          '## What changed',
          '',
          answer,
          '',
          runUrl ? `[سجل التشغيل](${runUrl})` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      }),
    },
    pushToken()
  );

  return { issue, pull, branch };
}

/**
 * The message that asks for a merge, with the first of the two controls.
 *
 * The confirmation row holds the PR number and the expiry; the button carries
 * only its id, so a stale message cannot merge something else after a new pull
 * request reuses a number.
 */
export async function announcePull({ chatId, messageRowId, pull, issue }) {
  const confirmation = await openConfirmation({
    chatId,
    messageId: messageRowId,
    kind: 'merge',
    target: pull.number,
  });

  const text = [
    `فتحت طلب دمج: [#${pull.number}](${pull.html_url}) — ${pull.title}`,
    issue ? `وسجّلت الطلب في [#${issue.number}](${issue.html_url}).` : '',
    confirmation ? 'إن أردت دمجه في main فالخطوة الأولى الزر أدناه، ثم تأكيد ثانٍ.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const keyboard = confirmation
    ? {
        inline_keyboard: [
          [{ text: `دمج #${pull.number}؟`, callback_data: `merge:${confirmation.id}` }],
        ],
      }
    : undefined;

  const sent = await sendMarkdown(chatId, text, { replyMarkup: keyboard });
  return { text, confirmation, telegramMessageId: sent[0]?.messageId ?? null };
}

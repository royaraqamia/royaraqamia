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

import { githubTarget, MODEL } from './config.mjs';
import { askModel, github } from './http.mjs';
import { openConfirmation } from './store.mjs';
import { sendMarkdown } from './progress.mjs';

const LABEL = 'telegram';

/**
 * A title a repository accepts.
 *
 * Everything in the repo is English: `git log`, a pull request, an issue and a
 * branch are read by people and agents who were not in this conversation, and
 * the repository gates the pull request title on this exact shape. The first
 * live write produced «نظّف مفتاح update_offset الميت من telegram_state…» and
 * failed `Conventional Commit Title` on the pull request it opened.
 */
export const CONVENTIONAL_TITLE =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9.-]+\))?!?: \S.{0,70}$/;

const TYPES = ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'perf', 'style', 'build', 'ci'];

const TITLE_PROMPT = [
  'Write one git commit title for the change described below, and nothing else.',
  'Format: type(scope): summary',
  'type is one of: feat, fix, chore, docs, test, refactor, perf, style, build, ci.',
  'scope is the area, lowercase, one word where possible (telegram, chats, db, android, web).',
  'summary is English, imperative, lowercase after the colon, at most 60 characters, no full stop.',
  'Describe what actually changed, not what was asked.',
  'Answer with the single line and no explanation.',
].join('\n');

/** `docs: …`, `chore(db): …` - a shape that passes even when the model does not. */
export function fallbackTitle(files = []) {
  const paths = files.length ? files : ['change'];
  if (paths.every((path) => path.startsWith('docs/'))) {
    return `docs: update ${slug(paths[0].replace(/^docs\//, '').replace(/\.md$/, ''), 40)}`;
  }
  if (paths.every((path) => path.startsWith('supabase/migrations/'))) {
    return 'chore(db): apply a migration';
  }
  if (paths.every((path) => path.startsWith('android/'))) {
    return 'chore(android): update the shell';
  }
  return 'chore(telegram): apply a change requested from the chat';
}

/**
 * One small model call for the title, validated rather than trusted.
 *
 * `ask` is injected so the fallback is testable without a gateway. A title that
 * does not match the shape - in the wrong language, too long, missing a type -
 * is replaced, never repaired: guessing at a malformed title is how an Arabic
 * sentence reached `main`'s history.
 */
export async function conventionalTitle({ request, answer, files, ask }) {
  const asked = [
    { role: 'system', content: TITLE_PROMPT },
    {
      role: 'user',
      content: [
        `<request>\n${request}\n</request>`,
        `<changed files>\n${files.slice(0, 20).join('\n')}\n</changed files>`,
        `<result>\n${String(answer).slice(0, 1500)}\n</result>`,
      ].join('\n\n'),
    },
  ];

  try {
    const message = await ask(asked);
    const line = String(message?.content ?? '')
      .trim()
      .split('\n')[0]
      .replace(/^[-*\s]+/, '')
      .replace(/\.$/, '')
      // A model likes to wrap the title in backticks or quotes, and the trailing
      // dot may sit outside them, so punctuation goes before the wrapper.
      .replace(/^[`"']+|[`"']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (CONVENTIONAL_TITLE.test(line)) return line;
  } catch {
    // A title is not worth failing a push over; the fallback is a valid one.
  }

  return fallbackTitle(files);
}

/** The files the turn changed, relative to the checkout. */
export function changedFiles(cwd) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

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
  // ASCII only: a branch name travels through URLs, refs and logs, and an Arabic
  // sentence percent-encodes into something nobody can retype. The pull request
  // title keeps the original words.
  const words = String(text ?? '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
    .toLowerCase();
  return (words || 'change').slice(0, limit).replace(/-+$/g, '') || 'change';
}

/** A publish failure that knows how far it got, so the chat message can be true. */
export class PublishError extends Error {
  constructor(message, { stage, branch, compareUrl } = {}) {
    super(message);
    this.stage = stage;
    this.branch = branch;
    this.compareUrl = compareUrl;
  }
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
 *
 * Three stages, and each failure says which one it reached: the issue is the
 * record and is best-effort, the push is what makes the branch exist, and the
 * pull request is what makes it reviewable. A failed pull request after a
 * successful push used to be reported as "no branch was created", which was not
 * true and would have made the owner retype a change that was already on the
 * remote.
 */
export async function publishWork({ cwd, messageRowId, requestText, answer, runUrl }) {
  const { owner, repo } = githubTarget();
  const files = changedFiles(cwd);

  // One small call for the title: the repository's history is English, and the
  // pull request gate refuses anything that is not conventional.
  const title = await conventionalTitle({
    request: String(requestText ?? ''),
    answer: String(answer ?? ''),
    files,
    ask: (messages) => askModel(messages, { model: MODEL, temperature: 0.2 }),
  });
  const branch = `telegram/${messageRowId ?? Date.now()}-${slug(title)}`;

  // The record is nice to have; a failure here must not cost the owner the work.
  const issue = await fileIssue({
    owner,
    repo,
    title,
    body: [
      '## Requested from Telegram',
      '',
      `> ${String(requestText ?? '').replace(/\n/g, ' ')}`,
      '',
      '## What changed',
      '',
      answer,
      runUrl ? `[Run log](${runUrl})` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }).catch(() => null);

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
  try {
    git(cwd, ['push', remote, `HEAD:refs/heads/${branch}`]);
  } catch (error) {
    throw new PublishError(String(error?.message ?? 'push failed'), { stage: 'push', branch });
  }

  const compareUrl = `https://github.com/${owner}/${repo}/compare/main...${branch}?expand=1`;
  const pull = await github(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        head: branch,
        base: 'main',
        body: [
          issue?.number ? `Closes #${issue.number}` : '',
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
  ).catch((error) => {
    throw new PublishError(String(error?.message ?? 'pull request failed'), {
      stage: 'pull',
      branch,
      compareUrl,
    });
  });

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

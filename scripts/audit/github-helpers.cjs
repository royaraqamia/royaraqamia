'use strict';

// Pure helpers shared by the inline github-script steps in the audit runner and
// the automation health monitor. CommonJS so a github-script step can require it
// by absolute path from GITHUB_WORKSPACE; the test suite loads the same module.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NUMBER_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const SECRET_RE = /\b(?:ghp|gho|github_pat|sb_secret|sk|AKIA)[A-Za-z0-9_-]{12,}\b/g;
const TOKEN_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

// An ISO date and a migration's 14-digit timestamp prefix are identifiers, not
// contact details. They are stashed before the broad number rule and restored
// after it, so a title keeps its date and a body keeps an openable file path.
// No trailing word boundary: an ISO timestamp continues with `T14:30:00Z`,
// where `\b` would fail and leave the date to the number rule.
const DATE_RE = /\b\d{4}-\d{2}-\d{2}(?!\d)/g;
const MIGRATION_RE = /\b\d{14}_[A-Za-z0-9_-]+/g;
const STASH_RE = /\u0000(\d+)\u0000/g;

function redact(text) {
  const keep = [];
  const stash = (value) => {
    keep.push(value);
    return '\u0000' + (keep.length - 1) + '\u0000';
  };
  const out = String(text || '')
    .replace(EMAIL_RE, '[email redacted]')
    .replace(DATE_RE, stash)
    .replace(MIGRATION_RE, stash)
    .replace(NUMBER_RE, '[number redacted]')
    .replace(SECRET_RE, '[secret redacted]')
    .replace(TOKEN_RE, '[token redacted]')
    // A /tmp path is a path on the runner, not on the reader's machine. The
    // publisher links the artifact, so name captures at its root.
    .replace(/\/tmp\/audit-evidence\//g, 'audit-evidence/');
  return out.replace(STASH_RE, (whole, index) => keep[Number(index)] ?? whole);
}

function utcDate(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

async function listComments(github, context, issueNumber, since) {
  return github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
    ...(since ? { since } : {}),
    per_page: 100,
  });
}

function reportTitle(domain) {
  return 'audit(' + domain + '): daily report log (rolling)';
}

function reportSlug(title) {
  return (
    String(title || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  );
}

// One marker per report, so a day with two clean-area reports does not drop the
// second one. The date prefix is what the daily guard counts.
function reportMarker(domain, date, title) {
  return reportDatePrefix(domain, date) + reportSlug(title) + ' -->';
}

function reportDatePrefix(domain, date) {
  return '<!-- audit:report:' + domain + ':' + date + ':';
}

// The first scheduled tick at or after a workflow was introduced. Git history is
// the only place that says when a workflow began to exist, so a workflow that has
// never run is judged from this tick, not from "now": the day-one heartbeat alert
// called two audits dead before their first slot was due (#1654).
function firstExpectedAt(target, introducedAtMs) {
  const at = new Date(introducedAtMs);
  at.setUTCHours(target.scheduleHourUtc, target.scheduleMinuteUtc, 0, 0);
  if (at.getTime() <= introducedAtMs) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

function isLapsed(beatAt, target, nowMs, staleMs, introducedAtMs) {
  if (beatAt) return nowMs - Date.parse(beatAt) > staleMs;
  if (!introducedAtMs) return false; // no proof it existed: wait rather than alert
  return nowMs - firstExpectedAt(target, introducedAtMs).getTime() > staleMs;
}

module.exports = {
  redact,
  utcDate,
  listComments,
  reportTitle,
  reportMarker,
  reportDatePrefix,
  firstExpectedAt,
  isLapsed,
};

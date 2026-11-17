import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXCEPTIONS_PATH = resolve('security/audit-exceptions.json');
const ADVISORY_ID = /^GHSA-[a-z0-9-]+$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const MAX_EXCEPTION_DAYS = 365;

export function validateExceptions(document, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { exceptions: [], errors: ['the exception file must contain a JSON object'] };
  }
  if (document.version !== 1) {
    errors.push('version must be 1');
  }
  if (!Array.isArray(document.exceptions)) {
    return { exceptions: [], errors: [...errors, 'exceptions must be an array'] };
  }

  const exceptions = [];
  const seen = new Set();
  document.exceptions.forEach((entry, index) => {
    const at = `exceptions[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      return;
    }

    const id =
      typeof entry.id === 'string' && ADVISORY_ID.test(entry.id) ? entry.id.toUpperCase() : null;
    if (!id) {
      errors.push(`${at}.id must be a GHSA advisory id`);
    } else if (seen.has(id)) {
      errors.push(`${at}.id duplicates ${id}`);
    } else {
      seen.add(id);
    }

    if (!['production', 'all'].includes(entry.scope)) {
      errors.push(`${at}.scope must be "production" or "all"`);
    }
    for (const field of ['reason', 'owner']) {
      if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
        errors.push(`${at}.${field} must be a non-empty string`);
      }
    }

    let upstreamValid = false;
    try {
      upstreamValid = new URL(entry.upstream).protocol === 'https:';
    } catch {
      upstreamValid = false;
    }
    if (!upstreamValid) {
      errors.push(`${at}.upstream must be an https URL`);
    }

    if (
      typeof entry.expires !== 'string' ||
      !ISO_DATE.test(entry.expires) ||
      Number.isNaN(Date.parse(entry.expires))
    ) {
      errors.push(`${at}.expires must be a YYYY-MM-DD date`);
    } else if (entry.expires < today) {
      errors.push(
        `${at} (${entry.id}) expired on ${entry.expires}; re-check it before it can suppress a finding`
      );
    } else if (Date.parse(entry.expires) - Date.parse(today) > MAX_EXCEPTION_DAYS * 86400000) {
      errors.push(`${at}.expires must be at most ${MAX_EXCEPTION_DAYS} days away`);
    }

    exceptions.push({ ...entry, id });
  });

  return { exceptions, errors };
}

export function advisoryIdsFromVia(via) {
  const ids = new Set();
  for (const entry of via ?? []) {
    if (!entry || typeof entry !== 'object') continue;
    const fromSource =
      typeof entry.source === 'string' && ADVISORY_ID.test(entry.source)
        ? entry.source.toUpperCase()
        : null;
    const fromUrl =
      typeof entry.url === 'string' ? entry.url.match(/GHSA-[a-z0-9-]+/i)?.[0].toUpperCase() : null;
    const id = fromSource ?? fromUrl;
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

export function classifyFindings(report, exceptions, scope) {
  const excepted = new Set(
    exceptions
      .filter((entry) => entry.scope === 'all' || entry.scope === scope)
      .map((entry) => entry.id)
  );
  const blocking = new Map();
  const suppressed = new Map();

  for (const [name, finding] of Object.entries(report?.vulnerabilities ?? {})) {
    if (!BLOCKING_SEVERITIES.has(finding?.severity)) continue;
    for (const id of advisoryIdsFromVia(finding.via)) {
      const target = excepted.has(id) ? suppressed : blocking;
      const current = target.get(id) ?? { id, packages: new Set(), severity: finding.severity };
      for (const affected of [name, ...(finding.effects ?? [])]) current.packages.add(affected);
      target.set(id, current);
    }
  }

  const asList = (map) =>
    [...map.values()]
      .map((entry) => ({ ...entry, packages: [...entry.packages].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id));

  return { blocking: asList(blocking), suppressed: asList(suppressed) };
}

function loadReport(reportPath, scope) {
  if (reportPath) {
    return JSON.parse(readFileSync(resolve(reportPath), 'utf8'));
  }
  // The command strings are fixed literals, so a shell (needed for npm.cmd on
  // Windows) cannot be handed any input from the caller.
  const command = scope === 'production' ? 'npm audit --json --omit=dev' : 'npm audit --json';
  const result = spawnSync(command, { shell: true, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (result.error || result.status === null) {
    throw new Error(`npm audit could not run: ${result.error?.message ?? 'no exit status'}`);
  }
  if (!result.stdout?.trim()) {
    throw new Error(
      `npm audit produced no JSON (exit ${result.status}): ${result.stderr?.trim() ?? ''}`
    );
  }
  return JSON.parse(result.stdout);
}

function main() {
  const args = process.argv.slice(2);
  const scopeArg = args.find((arg) => arg.startsWith('--scope='));
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  const unknown = args.filter((arg) => !arg.startsWith('--scope=') && !arg.startsWith('--report='));

  if (
    unknown.length > 0 ||
    (scopeArg && !['--scope=production', '--scope=all'].includes(scopeArg))
  ) {
    console.log(
      'Usage: node scripts/check-dependency-audit.mjs [--scope=production|all] [--report=<file>]'
    );
    process.exitCode = 1;
    return;
  }

  const scope = scopeArg ? scopeArg.slice('--scope='.length) : 'production';
  const reportPath = reportArg?.slice('--report='.length);

  const { exceptions, errors } = validateExceptions(
    JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8'))
  );
  if (errors.length > 0) {
    console.log('Invalid security/audit-exceptions.json:');
    for (const error of errors) console.log(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = loadReport(reportPath, scope);
  } catch (error) {
    console.log(`Dependency audit could not be read: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { blocking, suppressed } = classifyFindings(report, exceptions, scope);
  for (const entry of suppressed) {
    console.log(
      `Accepted ${entry.id} (${entry.packages.join(', ')}): covered by security/audit-exceptions.json`
    );
  }

  if (blocking.length === 0) {
    console.log(
      `OK: no unexcepted high/critical advisories in the ${scope} dependency tree` +
        ` (${suppressed.length} accepted).`
    );
    return;
  }

  console.log(`Unexcept high/critical advisories in the ${scope} dependency tree:`);
  for (const entry of blocking) {
    console.log(`  - ${entry.id} (${entry.severity}): ${entry.packages.join(', ')}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}

#!/usr/bin/env node
/**
 * Concurrency smoke test for the training application endpoint.
 *
 * Fires N requests with a fixed concurrency and reports latency percentiles and
 * a status breakdown.
 *
 * WARNING: this submits REAL applications. Each successful request inserts a row
 * and triggers admin notifications, so only target a preview deployment backed
 * by a throwaway database. Production is refused unless --allow-prod is passed.
 *
 * Usage:
 *   node scripts/load-test.mjs --url https://<preview>/api/training/applications \
 *     --concurrency 100 --total 200
 *
 * Flags:
 *   --url <url>         Target endpoint (default http://localhost:3000/api/training/applications)
 *   --concurrency <n>   In-flight requests (default 100)
 *   --total <n>         Total requests (default 200)
 *   --timeout <ms>      Per-request timeout (default 15000)
 *   --allow-prod        Permit the production domain (default: refuse)
 *   --help
 */

const DEFAULTS = {
  url: 'http://localhost:3000/api/training/applications',
  concurrency: 100,
  total: 200,
  timeout: 15_000,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS, allowProd: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--url':
        args.url = argv[++i];
        break;
      case '--concurrency':
        args.concurrency = Number(argv[++i]);
        break;
      case '--total':
        args.total = Number(argv[++i]);
        break;
      case '--timeout':
        args.timeout = Number(argv[++i]);
        break;
      case '--allow-prod':
        args.allowProd = true;
        break;
      case '--help':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

const PRODUCTION_HOSTS = ['royaraqamia.com', 'www.royaraqamia.com'];

function assertSafeTarget(url, allowProd) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid --url: ${url}`);
  }
  if (PRODUCTION_HOSTS.includes(parsed.hostname) && !allowProd) {
    throw new Error(
      `Refusing to load-test production (${parsed.hostname}). Pass --allow-prod only if you truly intend to write real rows.`
    );
  }
}

function buildPayload(index) {
  const digits = String(10000000 + index).slice(-8);
  return {
    course_slug: 'build-digital-products',
    full_name: `اختبار الحمل ${index}`,
    phone_whatsapp: `+963 9${digits.slice(0, 3)} ${digits.slice(3)}`,
    goal: 'load test',
  };
}

async function sendOne(url, timeout, index) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload(index)),
      signal: controller.signal,
    });
    await response.arrayBuffer().catch(() => undefined);
    return { status: response.status, duration: performance.now() - started };
  } catch (error) {
    return { status: 0, duration: performance.now() - started, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(total, concurrency, task) {
  const results = new Array(total);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    for (let index = next++; index < total; index = next++) {
      results[index] = await task(index);
    }
  });
  await Promise.all(workers);
  return results;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('See the header of scripts/load-test.mjs for usage.');
    return;
  }

  assertSafeTarget(args.url, args.allowProd);

  console.log(
    `Load testing ${args.url}\n  concurrency=${args.concurrency} total=${args.total} timeout=${args.timeout}ms\n`
  );

  const startedAt = performance.now();
  const results = await runPool(args.total, args.concurrency, (index) =>
    sendOne(args.url, args.timeout, index)
  );
  const wallMs = performance.now() - startedAt;

  const durations = results.map((r) => r.duration).sort((a, b) => a - b);
  const statusCounts = new Map();
  for (const result of results) {
    statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1);
  }

  const success = statusCounts.get(200) ?? 0;
  const serverErrors = [...statusCounts.entries()]
    .filter(([status]) => status >= 500 || status === 0)
    .reduce((sum, [, count]) => sum + count, 0);

  console.log('Status breakdown:');
  for (const [status, count] of [...statusCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${status === 0 ? 'network-error' : status}: ${count}`);
  }

  console.log('\nLatency (ms):');
  console.log(`  min    ${Math.round(durations[0] ?? 0)}`);
  console.log(`  p50    ${Math.round(percentile(durations, 50))}`);
  console.log(`  p95    ${Math.round(percentile(durations, 95))}`);
  console.log(`  p99    ${Math.round(percentile(durations, 99))}`);
  console.log(`  max    ${Math.round(durations[durations.length - 1] ?? 0)}`);

  console.log('\nThroughput:');
  console.log(`  wall   ${Math.round(wallMs)}ms`);
  console.log(`  rps    ${(results.length / (wallMs / 1000)).toFixed(1)}`);
  console.log(`  ok     ${success}/${results.length}`);

  if (serverErrors > 0) {
    console.error(`\nFAIL: ${serverErrors} request(s) failed with 5xx or a network error.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
});

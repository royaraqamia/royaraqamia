/**
 * Generate the capability coverage report from the registry (ADR-0183, #1417).
 *
 * The roadmap's coverage table used to be prose, and prose drifts: a product
 * gains a tool and the table still reads zero. This generator is the seam -
 * `agentCapabilities()` and `mcpCapabilities()` are the source, the markdown is
 * an output, and the output is committed so a pull request that edits either
 * table without regenerating fails CI (`npm run check:capabilities`).
 *
 * Nothing in the document is counted by hand: every number is a `filter` over
 * what the two doors actually declare, so a product with no capability still
 * appears, at zero, rather than disappearing from the report.
 *
 * Usage:
 *
 *   node scripts/generate-capabilities.mjs            # write the document
 *   node scripts/generate-capabilities.mjs --check    # fail if it is stale
 */
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.cwd());

/** The generated document, repo-relative. Prettier is told to leave it alone. */
const OUTPUT = 'docs/assistant/capabilities.md';

const DOOR = { turn: 'Turn', mcp: 'MCP' };

/**
 * Load the two tables through esbuild, which resolves `@/` and strips types.
 *
 * The generator is a `.mjs` script like every other one here, and the registry
 * is TypeScript that imports the assistant's tools: bundling it is the same
 * seam `generate-contracts.mjs` uses rather than a second copy of the rows.
 */
async function loadRegistry() {
  const entry = [
    "export { PRODUCTS, TOOL_TIERS, agentCapabilities } from './backend/services/tools/registry.ts';",
    "export { mcpCapabilities } from './backend/services/tools/mcp-capabilities.ts';",
    '',
  ].join('\n');

  const directory = await mkdtemp(path.join(tmpdir(), 'roy-capabilities-'));
  const outfile = path.join(directory, 'entry.cjs');
  try {
    const { build } = await import('esbuild');
    await build({
      stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      // CommonJS, not ESM: the tool table reaches a dependency that requires a
      // node builtin at run time, which an ESM bundle cannot do.
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      alias: { '@': ROOT },
      // Next resolves `server-only` at build time and does not install it as a
      // package. The registry reaches a domain module that marks itself with it,
      // so the bundle needs the same empty marker the tests use — a plugin here
      // rather than an installed stub, so nothing new lands in `node_modules`.
      plugins: [
        {
          // sharp's ESM entry resolves its native binary through
          // `createRequire(import.meta.url)`, which is undefined inside this
          // CommonJS report bundle. The registry only reads static capability
          // tables, so the image service's dependency is stubbed rather than
          // bundled — the same trick used for `server-only` below.
          name: 'native-image-stub',
          setup(build) {
            build.onResolve({ filter: /^sharp$/ }, () => ({
              path: 'sharp',
              namespace: 'native-image-stub',
            }));
            build.onLoad({ filter: /.*/, namespace: 'native-image-stub' }, () => ({
              contents: 'module.exports = {};',
              loader: 'js',
            }));
          },
        },
        {
          name: 'server-only',
          setup(build) {
            build.onResolve({ filter: /^server-only$/ }, () => ({
              path: 'server-only',
              namespace: 'server-only-marker',
            }));
            build.onLoad({ filter: /.*/, namespace: 'server-only-marker' }, () => ({
              contents: '',
              loader: 'js',
            }));
          },
        },
      ],
      outfile,
      logLevel: 'silent',
    });
    const loaded = createRequire(import.meta.url)(outfile);
    return {
      products: loaded.PRODUCTS,
      tiers: loaded.TOOL_TIERS,
      agent: loaded.agentCapabilities(),
      mcp: loaded.mcpCapabilities(),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * One row per capability id, with the doors that declare it.
 *
 * Two doors declaring the same id with a different kind or tier is a registry
 * defect, not a rendering choice: the document would have to pick one of them
 * and the other door would read as covered by a tier it does not enforce. It
 * fails here, naming the id, instead of quietly reporting half the truth.
 */
export function mergeCapabilities(agent, mcp) {
  const merged = new Map();

  for (const [door, capabilities] of [
    ['turn', agent],
    ['mcp', mcp],
  ]) {
    for (const entry of capabilities) {
      const existing = merged.get(entry.id);
      if (!existing) {
        merged.set(entry.id, {
          id: entry.id,
          owner: entry.owner,
          kind: entry.kind,
          tier: entry.tier,
          doors: [door],
        });
        continue;
      }
      if (
        existing.owner !== entry.owner ||
        existing.kind !== entry.kind ||
        existing.tier !== entry.tier
      ) {
        throw new Error(
          `generate-capabilities: ${entry.id} is declared twice with different terms ` +
            `(${existing.owner}/${existing.kind}/tier ${existing.tier} from ${existing.doors.join(', ')}; ` +
            `${entry.owner}/${entry.kind}/tier ${entry.tier} from ${door})`
        );
      }
      if (!existing.doors.includes(door)) existing.doors.push(door);
    }
  }

  return [...merged.values()];
}

const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ].join('\n');

/** Every owner in registry order, products first and the mechanism last. */
function owners(products, capabilities) {
  const known = new Set(products);
  const extra = [...new Set(capabilities.map((entry) => entry.owner))].filter(
    (owner) => !known.has(owner)
  );
  return [...products, ...extra.sort()];
}

const count = (capabilities, kind) => capabilities.filter((entry) => entry.kind === kind).length;

/** The document, from the two tables. Pure: the check compares its bytes. */
export function render({ products, tiers, agent, mcp }) {
  const capabilities = mergeCapabilities(agent, mcp);
  const order = owners(products, capabilities);
  const byOwner = new Map(order.map((owner) => [owner, []]));
  for (const entry of capabilities) byOwner.get(entry.owner)?.push(entry);

  const rows = order.map((owner) => {
    const owned = byOwner.get(owner) ?? [];
    return [
      `\`${owner}\``,
      String(count(owned, 'read')),
      String(count(owned, 'write')),
      String(owned.filter((entry) => entry.doors.includes('turn')).length),
      String(owned.filter((entry) => entry.doors.includes('mcp')).length),
    ];
  });

  const reads = count(capabilities, 'read');
  const writes = count(capabilities, 'write');

  const sections = order.map((owner) => {
    const owned = byOwner.get(owner) ?? [];
    const heading = `## \`${owner}\`\n`;
    if (owned.length === 0) {
      return `${heading}\nNo capability on either door yet.\n`;
    }

    const body = table(
      ['Capability', 'Kind', 'Tier', 'Doors'],
      owned.map((entry) => [
        `\`${entry.id}\``,
        entry.kind,
        String(entry.tier),
        entry.doors.map((door) => DOOR[door]).join(' + '),
      ])
    );
    return `${heading}\n${count(owned, 'read')} read, ${count(owned, 'write')} write.\n\n${body}\n`;
  });

  return [
    '<!-- Generated by scripts/generate-capabilities.mjs from',
    '     backend/services/tools/registry.ts and backend/services/tools/mcp-capabilities.ts.',
    '     Do not edit by hand: run `npm run capabilities:generate` after changing either table. -->',
    '',
    '# Capability coverage',
    '',
    'Every capability the two doors declare, grouped by the product that owns it',
    "(ADR-0183). A capability is one thing a product can do on a member's behalf;",
    'the turn and the MCP server are adapters over the same declaration, so a row',
    'that reads `Turn + MCP` is the same operation reached two ways.',
    '',
    `**Tier** is the blast radius (ADR-0180), one of ${tiers.map((tier) => `\`${tier}\``).join(', ')}:`,
    'a read is always tier 0 and runs inside the turn; a write is above it, and',
    "tier 2 or 3 is always a card. Every write's tier is in the table below.",
    '',
    `**${capabilities.length} capabilities** (${reads} read, ${writes} write): ` +
      `${agent.length} declared by the turn, ${mcp.length} by the MCP server.`,
    '',
    table(['Product', 'Reads', 'Writes', 'Turn', 'MCP'], rows),
    '',
    ...sections,
  ].join('\n');
}

async function main(argv) {
  const check = argv.includes('--check');
  const rendered = render(await loadRegistry());
  const target = path.join(ROOT, OUTPUT);

  if (!check) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, rendered, 'utf8');
    return 0;
  }

  let onDisk = null;
  try {
    onDisk = await readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (onDisk !== rendered) {
    process.stderr.write(
      `The capability report is stale: ${OUTPUT}\n` +
        'Run `npm run capabilities:generate` and commit the result.\n'
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  );
}

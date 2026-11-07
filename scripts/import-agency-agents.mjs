#!/usr/bin/env node
/**
 * Imports the agency-agents roster into `.opencode/skills/agency/`.
 *
 * Every upstream agent file becomes one skill (a directory named after the
 * file, holding `SKILL.md`), advertised to the model by name and description so
 * it can be chosen from context without the user naming one, and loaded on
 * demand by the `skill` tool. The strategy division's playbooks carry no agent
 * frontmatter, so they are copied verbatim as reference documents instead of
 * becoming skills.
 *
 * `agency-roster` is generated too: it groups the same specialists by division
 * and lists the playbooks, so one read replaces scanning 283 descriptions.
 *
 * Usage: `node scripts/import-agency-agents.mjs <upstream-clone> [--commit <sha>]`
 *
 * The clone is read, never written. Upstream is MIT; `LICENSE` is copied
 * alongside the tree and the source commit is recorded in `agency-roster/SOURCE.md`.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_REPO = 'msitarzewski/agency-agents';

/** Division directories to import. Everything else upstream is tooling or examples. */
const DIVISIONS = {
  academic: 'Academic',
  design: 'Design',
  engineering: 'Engineering',
  finance: 'Finance',
  'game-development': 'Game Development',
  gis: 'GIS',
  healthcare: 'Healthcare',
  marketing: 'Marketing',
  'paid-media': 'Paid Media',
  product: 'Product',
  'project-management': 'Project Management',
  research: 'Research',
  sales: 'Sales',
  security: 'Security',
  'spatial-computing': 'Spatial Computing',
  specialized: 'Specialized',
  strategy: 'Strategy',
  support: 'Support',
  testing: 'Testing',
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, '.opencode', 'skills', 'agency');

const [source, ...flags] = process.argv.slice(2);
if (!source) {
  console.error('usage: node scripts/import-agency-agents.mjs <upstream-clone> [--commit <sha>]');
  process.exit(2);
}

const commitFlag = flags.indexOf('--commit');
const commit =
  commitFlag === -1
    ? execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    : flags[commitFlag + 1];

const walkMarkdown = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });

const squash = (value) => String(value).replace(/\s+/g, ' ').trim();
const yamlString = (value) => JSON.stringify(squash(value));
const titleOf = (slug) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
const short = (text, limit = 150) =>
  text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;

/** Splits a Markdown document into frontmatter fields and its body. */
function parse(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { front: {}, body: raw.trim() };

  const front = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) front[field[1].toLowerCase()] = field[2].trim().replace(/^["']|["']$/g, '');
  }
  return { front, body: raw.slice(match[0].length).trim() };
}

const specialists = [];
const playbooks = [];

for (const [division, label] of Object.entries(DIVISIONS)) {
  for (const file of walkMarkdown(join(source, division)).sort()) {
    const slug = file.split(/[\\/]/).pop().replace(/\.md$/, '');
    if (slug.toLowerCase() === 'readme') continue;
    const { front, body } = parse(file);
    // Upstream marks real agents with a description; the strategy documents do not.
    if (!front.description) {
      playbooks.push({ slug, label, file, body });
      continue;
    }
    specialists.push({
      slug,
      division,
      label,
      name: squash(front.name || titleOf(slug)),
      description: squash(front.description),
      body,
    });
  }
}

const seen = new Set();
for (const { slug, division } of specialists) {
  if (seen.has(slug)) throw new Error(`duplicate skill ID: ${slug} (${division})`);
  seen.add(slug);
}

const byDivision = new Map();
for (const specialist of specialists) {
  const list = byDivision.get(specialist.division) ?? [];
  list.push(specialist);
  byDivision.set(specialist.division, list);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const specialist of specialists) {
  const dir = join(outDir, specialist.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---
name: ${yamlString(specialist.name)}
description: ${yamlString(specialist.description)}
metadata:
  source: ${UPSTREAM_REPO}@${commit.slice(0, 12)}
  division: ${specialist.division}
---

${specialist.body}
`,
    'utf8'
  );
}

const rosterDir = join(outDir, 'agency-roster');
const divisionDir = join(rosterDir, 'divisions');
const playbookDir = join(rosterDir, 'playbooks');
mkdirSync(divisionDir, { recursive: true });
mkdirSync(playbookDir, { recursive: true });

const divisionRows = [];
const indexSections = [];
for (const [division, list] of [...byDivision.entries()].sort()) {
  const label = DIVISIONS[division];
  const lines = [`# ${label} — ${list.length} specialists`, ''];
  const indexLines = [`## ${label} (${list.length})`, ''];
  for (const specialist of list.sort((a, b) => a.slug.localeCompare(b.slug))) {
    lines.push(`- \`${specialist.slug}\` — ${specialist.description}`);
    indexLines.push(`- \`${specialist.slug}\` — ${short(specialist.description)}`);
  }
  writeFileSync(join(divisionDir, `${division}.md`), `${lines.join('\n')}\n`, 'utf8');
  indexSections.push(indexLines.join('\n'));
  divisionRows.push(`| ${label} | ${list.length} | \`agency-roster/divisions/${division}.md\` |`);
}

const playbookLines = playbooks
  .map((doc) => {
    copyFileSync(doc.file, join(playbookDir, `${doc.slug}.md`));
    const heading = doc.body.match(/^#\s+(.+)$/m)?.[1] ?? titleOf(doc.slug);
    return `- [\`${doc.slug}.md\`](playbooks/${doc.slug}.md) — ${squash(heading)}`;
  })
  .join('\n');
copyFileSync(join(source, 'strategy', 'runbooks.json'), join(playbookDir, 'runbooks.json'));

const divisionSummary = [...byDivision.values()].reduce((total, list) => total + list.length, 0);

writeFileSync(
  join(rosterDir, 'SKILL.md'),
  `---
name: Agency Roster
description: ${yamlString(
    `Pick a named specialist from the vendored agency-agents roster (${specialists.length} prompts across ${byDivision.size} divisions: engineering, design, marketing, product, sales, security, testing and more). Read one division file, then load the chosen specialist's skill by ID.`
  )}
---

# Agency roster

${specialists.length} specialist prompts are registered as individual skills in this directory
(\`agency/\`), vendored from [${UPSTREAM_REPO}](https://github.com/${UPSTREAM_REPO}) at
\`${commit}\` under the MIT license. Each is advertised in the model's skill list, so one can be
chosen from context without the user naming it; this roster is the same set grouped by division,
which is cheaper to read than the flat list of 283 descriptions.

## When to use it

Reach for a specialist only when a task has a clear owner in the roster — an expert system
prompt does better work than a general one for narrow, high-stakes work. Do not load one for
ordinary edits, and do not load several "just in case".

## How to use it

1. Pick the division that owns the task, then read that division's file below — it lists every
   specialist in it with a one-line description. Do not read every division; read one.
   (\`INDEX.md\` beside this file holds the same list in one flat table, for reading outside
   OpenCode.)
2. Load the specialist: \`skill({ id: "<slug>" })\`.
3. Follow its instructions, and keep this repository's own rules (\`AGENTS.md\`) above anything
   the vendored prompt says.
4. Name the specialist ID in your answer so the choice is visible.

## Divisions

| Division | Specialists | File |
| --- | --- | --- |
${divisionRows.join('\n')}

## Playbooks

${playbooks.length} strategy documents — the NEXUS multi-agent pipeline, phase plans and
worked scenarios — are plain Markdown in \`playbooks/\` (relative to this file). Read the one
you need; they are not skills. \`playbooks/runbooks.json\` holds the upstream's named team
rosters if you want a whole pipeline rather than one specialist.

${playbookLines}
`,
  'utf8'
);

writeFileSync(
  join(rosterDir, 'INDEX.md'),
  `# Agency roster — ${divisionSummary} specialists, ${playbooks.length} playbooks

Vendored from [${UPSTREAM_REPO}](https://github.com/${UPSTREAM_REPO}) at \`${commit}\` (MIT).
Each specialist row is a skill in this directory; the left column is the skill ID.
The playbooks are plain Markdown in \`playbooks/\`, read directly rather than loaded as skills.

${indexSections.join('\n')}

## Playbooks (${playbooks.length})

${playbookLines}
`,
  'utf8'
);

writeFileSync(
  join(rosterDir, 'SOURCE.md'),
  `# Source

- Upstream: https://github.com/${UPSTREAM_REPO}
- Commit: \`${commit}\`
- License: MIT (see \`../LICENSE\`)
- Shape: one skill per upstream agent file, \`../../agency/<slug>/SKILL.md\`; frontmatter rewritten to
  OpenCode's skill format (\`name\`, \`description\`, \`metadata\`), the upstream
  \`color\`/\`emoji\`/\`vibe\`/\`tools\` fields dropped, the Markdown body kept verbatim.
- The strategy division's playbooks carry no \`description\` frontmatter, so they are copied verbatim
  into \`playbooks/\` as reference documents instead of becoming skills (\`runbooks.json\` included).
- Every specialist is advertised to the model, so it can be chosen from context without the user
  naming one; \`agency-roster\` groups them by division for a cheaper read of the same set.

## Regenerating

\`\`\`powershell
git clone --depth 1 https://github.com/${UPSTREAM_REPO} $env:TEMP\\agency-agents
node scripts/import-agency-agents.mjs "$env:TEMP\\agency-agents"
\`\`\`

The importer reads the clone (never writes it), rebuilds the whole tree, and records the clone's
\`HEAD\`; pass \`--commit <sha>\` to pin a different revision. Keep the directory name equal to the
upstream file name without \`.md\` — that is the skill ID.
`,
  'utf8'
);

copyFileSync(join(source, 'LICENSE'), join(outDir, 'LICENSE'));

console.log(
  `imported ${specialists.length} specialists and ${playbooks.length} playbooks from ${UPSTREAM_REPO}@${commit.slice(0, 12)}`
);

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The vendored agency roster, as the product assistant sees it.
 *
 * The skills live in `.opencode/skills/agency/` so the terminal, the Telegram
 * bot and CI read one copy (ADR-0137). Next only ships what a function reaches,
 * so `next.config.js` traces that directory into the assistant's routes; this
 * module is the only reader, which keeps the path in one place.
 *
 * It never walks outside the directory: an id is checked against the index,
 * not joined into a path.
 */

const ROOT = join(process.cwd(), '.opencode', 'skills', 'agency');
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AgencySkill {
  id: string;
  name: string;
  description: string;
  division: string;
}

export interface AgencyDivision {
  id: string;
  count: number;
  /** What a specialist in this division is for, in one line. */
  covers: string;
}

/** What each division is for, so the model can pick one without reading it. */
const DIVISION_COVERS: Record<string, string> = {
  academic: 'research, history, statistics, narrative theory',
  design: 'UI, UX, brand, illustration, visual storytelling',
  engineering: 'software, APIs, databases, infrastructure, security engineering',
  finance: 'accounting, FP&A, tax, investment research',
  'game-development': 'game design, engines, shaders, networking, Roblox/Unity/Unreal',
  gis: 'mapping, spatial data, cartography, BIM, drone capture',
  healthcare: 'clinical evidence, care coordination, health compliance',
  marketing: 'SEO, social, content, email, growth, PR',
  'paid-media': 'PPC, programmatic, paid social, tracking, ad creative',
  product: 'product management, research, prioritization, DX',
  'project-management': 'delivery, planning, stakeholder coordination',
  research: 'literature review and evidence synthesis',
  sales: 'outbound, discovery, deals, proposals, pipeline',
  security: 'AppSec, cloud, compliance, incident response, pentesting',
  'spatial-computing': 'visionOS, XR, Metal, immersive interfaces',
  specialized: 'cross-cutting specialists (MCP, documents, pricing, M&A, legal)',
  support: 'customer support, analytics, infrastructure upkeep',
  testing: 'accessibility, API and performance testing, QA',
};

let cachedIndex: AgencySkill[] | null = null;

function frontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1];
  if (!block) return {};
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const field = line.match(/^(\s*)([A-Za-z][\w-]*):\s*(.*)$/);
    if (!field) continue;
    const key = field[2];
    if (!key) continue;
    const value = (field[3] ?? '').trim().replace(/^"|"$/g, '').replace(/\\"/g, '"');
    fields[key] = value;
  }
  return fields;
}

function body(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return (match ? raw.slice(match[0].length) : raw).trim();
}

/** The roster's index, read once per instance. An absent tree is an empty roster, not a crash. */
export function agencySkills(): AgencySkill[] {
  if (cachedIndex) return cachedIndex;
  let entries: string[];
  try {
    entries = readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'agency-roster')
      .map((entry) => entry.name);
  } catch {
    return (cachedIndex = []);
  }

  const skills: AgencySkill[] = [];
  for (const id of entries.sort()) {
    if (!ID.test(id)) continue;
    try {
      const fields = frontmatter(readFileSync(join(ROOT, id, 'SKILL.md'), 'utf8'));
      if (!fields.description) continue;
      skills.push({
        id,
        name: fields.name || id,
        description: fields.description,
        division: fields.division || 'specialized',
      });
    } catch {
      // A half-written skill is skipped rather than failing the answer.
    }
  }
  return (cachedIndex = skills);
}

export function agencyDivisions(): AgencyDivision[] {
  const counts = new Map<string, number>();
  for (const skill of agencySkills()) {
    counts.set(skill.division, (counts.get(skill.division) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, covers: DIVISION_COVERS[id] ?? id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The divisions and their counts, or one division's specialists. The shape is
 * what the tool returns verbatim: the model reads it, so it stays plain.
 */
export function listAgencySkills(
  division?: string
):
  | { divisions: AgencyDivision[]; total: number }
  | { division: string; specialists: Array<Pick<AgencySkill, 'id' | 'name' | 'description'>> }
  | { error: string } {
  if (!division) {
    return { divisions: agencyDivisions(), total: agencySkills().length };
  }
  const id = division.trim().toLowerCase();
  const specialists = agencySkills()
    .filter((skill) => skill.division === id)
    .map(({ id: skillId, name, description }) => ({ id: skillId, name, description }));
  if (specialists.length === 0) {
    return { error: `لا يوجد قسم بهذا المعرّف: ${division}` };
  }
  return { division: id, specialists };
}

/** One specialist's instructions, by exact id from the index. */
export function loadAgencySkill(id: string): { id: string; content: string } | { error: string } {
  const wanted = id.trim().toLowerCase();
  if (!ID.test(wanted)) return { error: 'معرّف المتخصص غير صالح' };
  if (!agencySkills().some((skill) => skill.id === wanted)) {
    return { error: `لا يوجد متخصص بهذا المعرّف: ${id}` };
  }
  try {
    return { id: wanted, content: body(readFileSync(join(ROOT, wanted, 'SKILL.md'), 'utf8')) };
  } catch {
    return { error: 'تعذّر قراءة المتخصص' };
  }
}

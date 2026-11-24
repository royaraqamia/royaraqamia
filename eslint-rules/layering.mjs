/**
 * `controller -> service -> repository/client`, enforced instead of described.
 *
 * `docs/architecture.md` states the rule and `AGENTS.md` repeats it, but nothing failed a
 * pull request that broke it: an unattended agent can put a `.from('chat_reports')` in a
 * component and every gate stays green. This rule is the mechanical half.
 *
 * It is deliberately narrow — six crossings, each already true of the codebase — so it
 * fails a new violation and no existing file:
 *
 * - `backend/**` may not reach into `frontend/**`.
 * - `frontend/**` may not import the data layer (`backend/repositories`, `backend/clients`,
 *   `backend/services`) — the loaders and the config it is given are how it reads.
 * - `app/**` and `frontend/ui/**` may not import a Supabase client — SDK isolation.
 * - `backend/services/**` may not import a repository or client *value*: a service depends
 *   on the interface, and the wiring is `backend/config`'s job.
 * - `backend/controllers/**` may not import a repository or client *value* either: a
 *   controller parses, calls one service and shapes the response (ADR-0136).
 * - `frontend/**` may not import a route's `_components/` folder: that folder is private to
 *   the route that owns it, and a component another layer wants belongs in `frontend/ui/`
 *   (ADR-0196 — `PostList` used to be reachable only through the account posts page).
 *
 * Every path boundary is declared once in `BOUNDARIES` below. `importForms` compiles the
 * `@/` alias and the relative walk from that single declaration, so a boundary cannot be
 * added for one spelling of an import and forgotten for the other.
 *
 * Type-only imports are allowed everywhere: a service importing `type OtpRepository` is
 * following the rule, not breaking it, and `import type` is how the repo already says so.
 * Core ESLint cannot express "value only", which is why this is a local rule rather than
 * `no-restricted-imports`.
 */

import path from 'node:path';

const alias = (suffix) => new RegExp('^@/' + suffix + '/');

/**
 * The relative spelling of the same target. Boundaries rooted inside `backend/` may omit
 * the root, because `../repositories/push/...` and `@/backend/repositories/push/...` name
 * the same folder from a controller or a service.
 */
function relative(suffix, rootOptional = false) {
  const segments = suffix.split('/');
  const target = rootOptional ? `(?:${segments[0]}/)?${segments.slice(1).join('/')}` : suffix;
  return new RegExp('(^|/)\\.\\.?\\/(?:[^/]+\\/)*' + target + '/');
}

/** One declaration per boundary; both import forms come out of it. */
const BOUNDARIES = {
  frontend: { suffix: 'frontend' },
  backendDataLayer: { suffix: 'backend/(repositories|clients|services)' },
  backendPersistence: { suffix: 'backend/(repositories|clients)', rootOptional: true },
  backendConfig: { suffix: 'backend/config', rootOptional: true },
};

/**
 * Pure configuration: a deployment value or a fixed client, not a choice
 * between service implementations. A re-export of a factory is *not* pure —
 * importing `backend/config/certificates` to get
 * `createCertificatesRepository` is exactly what the zone below refuses
 * (#1804).
 */
const PURE_CONFIG_SOURCES = [
  /^@\/backend\/config\/(?:env|origin|supabase|mcp-scopes|generated\/.*)$/,
  /(^|\/)(\.\.\/)+(?:backend\/)?config\/(?:env|origin|supabase|mcp-scopes|generated\/.*)$/,
];

/**
 * Files still allowed to reach the container from the service layer. Every
 * entry is a follow-up, named here so a new one cannot be added quietly; a
 * service that needs a product service takes it through its own deps instead.
 */
const CONFIG_IMPORT_ALLOW = [
  // chat-agent-tools.ts is deliberately absent: #1804 moved its wiring out.
  // News' card limit still calls the plan factory itself — follow-up to #1804.
  /^backend\/services\/news\/card-limit\.ts$/,
  // The other door's adapters: the MCP tools are a separate composition root
  // and are explicitly out of scope for #1804.
  /^backend\/services\/mcp\/tools\//,
  /^backend\/services\/mcp\/marketplace\/connect-service\.ts$/,
];

const importForms = (boundary) => [
  alias(boundary.suffix),
  relative(boundary.suffix, boundary.rootOptional),
];

/** A route's private component folder, reached by alias or by a relative walk. */
const ROUTE_COMPONENTS = [
  /^@\/app\/.*\/_components\//,
  /(^|\/)\.\.?\/(.*\/)?app\/.*\/_components\//,
];

const ZONES = [
  {
    importer: /^backend\//,
    forbidden: importForms(BOUNDARIES.frontend),
    why: 'the server layer may not depend on the client layer',
  },
  {
    importer: /^frontend\//,
    forbidden: importForms(BOUNDARIES.backendDataLayer),
    why: 'the client reads through a loader or a contract, never through the data layer',
  },
  {
    importer: /^(app|frontend\/ui)\//,
    forbidden: [/^@supabase\//],
    why: 'the Supabase SDK stays behind `backend/` and `frontend/transport`',
  },
  {
    importer: /^backend\/services\//,
    forbidden: importForms(BOUNDARIES.backendPersistence),
    why: 'a service depends on the interface it declares, and `backend/config` wires it',
  },
  {
    importer: /^backend\/services\//,
    forbidden: importForms(BOUNDARIES.backendConfig),
    except: PURE_CONFIG_SOURCES,
    allow: CONFIG_IMPORT_ALLOW,
    skipTests: true,
    why: 'a service depends on the interface it declares, and `backend/config` wires it (#1804)',
  },
  {
    importer: /^backend\/controllers\//,
    forbidden: importForms(BOUNDARIES.backendPersistence),
    why: 'a controller calls one service; `backend/config` owns the repository wiring',
  },
  {
    importer: /^frontend\//,
    forbidden: ROUTE_COMPONENTS,
    why: "a route's `_components` folder is that route's, so a shared component belongs in `frontend/ui/`",
  },
];

const ENABLED_ZONES = ZONES.filter((zone) => zone.enabled !== false);

const plugin = {
  meta: { name: 'layering' },
  rules: {
    'no-cross-layer-import': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Refuses an import that crosses a layer boundary in docs/architecture.md',
        },
        schema: [],
        messages: {
          crossed: '`{{importer}}` may not import `{{source}}`: {{why}}',
        },
      },
      create(context) {
        const filename = String(context.filename || '').replace(/\\/g, '/');
        const relative = path.relative(process.cwd(), filename).replace(/\\/g, '/');
        // Every matching zone is checked, not just the first: `frontend/ui` matches both
        // the client-layer zone and the SDK-isolation zone, and only the second forbids
        // a Supabase import.
        const zones = ENABLED_ZONES.filter((candidate) => candidate.importer.test(relative));
        if (zones.length === 0) return {};

        const isTypeOnly = (node) =>
          node.importKind === 'type' ||
          (Array.isArray(node.specifiers) &&
            node.specifiers.length > 0 &&
            node.specifiers.every((specifier) => specifier.importKind === 'type'));

        const check = (node) => {
          const source = node.source && node.source.value;
          if (typeof source !== 'string') return;
          if (isTypeOnly(node)) return;
          for (const zone of zones) {
            // Tests assemble real dependencies to exercise a unit; they are not
            // production wiring and are not part of this boundary (#1804).
            if (zone.skipTests && relative.includes('/__tests__/')) continue;
            if (zone.except?.some((pattern) => pattern.test(source))) continue;
            if (zone.allow?.some((pattern) => pattern.test(relative))) continue;
            if (!zone.forbidden.some((pattern) => pattern.test(source))) continue;
            context.report({
              node: node.source,
              messageId: 'crossed',
              data: { importer: relative, source, why: zone.why },
            });
            return;
          }
        };

        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },
  },
};

export default plugin;

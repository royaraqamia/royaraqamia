/**
 * `controller -> service -> repository/client`, enforced instead of described.
 *
 * `docs/architecture.md` states the rule and `AGENTS.md` repeats it, but nothing failed a
 * pull request that broke it: an unattended agent can put a `.from('chat_reports')` in a
 * component and every gate stays green. This rule is the mechanical half.
 *
 * It is deliberately narrow — five crossings, each already true of the codebase — so it
 * fails a new violation and no existing file:
 *
 * - `backend/**` may not reach into `frontend/**`.
 * - `frontend/**` may not import the data layer (`backend/repositories`, `backend/clients`,
 *   `backend/services`) — the loaders and the config it is given are how it reads.
 * - `app/**` and `frontend/ui/**` may not import a Supabase client — SDK isolation.
 * - `backend/services/**` may not import a repository or client *value*: a service depends
 *   on the interface, and the wiring is `backend/config`'s job.
 * - `frontend/**` may not import a route's `_components/` folder: that folder is private to
 *   the route that owns it, and a component another layer wants belongs in `frontend/ui/`
 *   (ADR-0196 — `PostList` used to be reachable only through the account posts page).
 *
 * Type-only imports are allowed everywhere: a service importing `type OtpRepository` is
 * following the rule, not breaking it, and `import type` is how the repo already says so.
 * Core ESLint cannot express "value only", which is why this is a local rule rather than
 * `no-restricted-imports`.
 */

import path from 'node:path';

const alias = (suffix) => new RegExp('^@/' + suffix + '/');

/** A route's private component folder, reached by alias or by a relative walk. */
const ROUTE_COMPONENTS = [
  /^@\/app\/.*\/_components\//,
  /(^|\/)\.\.?\/(.*\/)?app\/.*\/_components\//,
];

const ZONES = [
  {
    importer: /^backend\//,
    forbidden: [/^@\/frontend\//, /(^|\/)\.\.?\/.*frontend\//],
    why: 'the server layer may not depend on the client layer',
  },
  {
    importer: /^frontend\//,
    forbidden: [
      alias('backend/(repositories|clients|services)'),
      /(^|\/)\.\.?\/.*backend\/(repositories|clients|services)\//,
    ],
    why: 'the client reads through a loader or a contract, never through the data layer',
  },
  {
    importer: /^(app|frontend\/ui)\//,
    forbidden: [/^@supabase\//],
    why: 'the Supabase SDK stays behind `backend/` and `frontend/transport`',
  },
  {
    importer: /^backend\/services\//,
    forbidden: [alias('backend/(repositories|clients)')],
    why: 'a service depends on the interface it declares, and `backend/config` wires it',
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

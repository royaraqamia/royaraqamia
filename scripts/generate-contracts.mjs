/**
 * Generate the app's Kotlin contract types from the Zod schemas in
 * `shared/contracts` (ADR-0089, #648).
 *
 * The app and the site are two clients of one contract, and a contract that
 * drifts silently is a runtime failure discovered by a user. This generator is
 * the seam: a Zod schema is the source, the Kotlin data class is an output, and
 * the output is committed so a pull request that edits a schema without
 * regenerating fails CI (`npm run check:contracts`).
 *
 * Usage:
 *
 *   node scripts/generate-contracts.mjs            # write the Kotlin files
 *   node scripts/generate-contracts.mjs --check    # fail if they are stale
 *
 * The list below is the app's side of the seam: a schema is exposed to Kotlin
 * only by being named here, so the app's surface is reviewable in one place
 * instead of being whatever happens to be exported.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(process.cwd());

/** Null under a bundler or a DOM test environment, where there is no file URL. */
const SCRIPT_PATH = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : null;

/** Where the generated Kotlin lands. The app module compiles it as-is. */
const OUTPUT_DIR = path.join(
  ROOT,
  'android/app/src/main/kotlin/com/royaraqamia/app/contracts/generated'
);

const PACKAGE = 'com.royaraqamia.app.contracts.generated';

/**
 * One entry per contract module that the app decodes. `file` is the generated
 * Kotlin file, `schemas` the Zod exports in that module.
 *
 * Start narrow: the first entry is the endpoint #648 reads end to end
 * (`GET /api/me/usage`), which is authorized and returns a shape the app will
 * render as soon as the shell exists. Adding a module is a line here.
 *
 * `GET /api/me/plan` joined it with the plan card (#647): the card draws the
 * allowance, the owned-item caps and the expiry, and the body is the page's own
 * - one route for both clients (ADR-0098).
 */
export const CONTRACTS = [
  {
    module: 'shared/contracts/plans',
    file: 'PlansContracts.kt',
    schemas: ['MyUsageResponseSchema', 'MyPlanResponseSchema'],
  },
  {
    module: 'shared/contracts/mcp-connected-apps',
    file: 'McpConnectedAppsContracts.kt',
    schemas: ['McpConnectedAppListResultSchema', 'McpConnectedAppActionResultSchema'],
  },
  // `GET /habitflow/api/sync` joined with the store (#768): the app paints
  // HabitFlow from rows it holds, so the body it holds them from is a contract
  // the generator has to emit. It is the web pull's route, tombstones included
  // (ADR-0029), not the narrower display endpoints.
  //
  // The write bodies joined with the Outbox (#650): an intent's payload is a
  // generated type, so a field the server stops accepting is a compile error in
  // the app rather than a queued write that can never drain.
  {
    module: 'shared/contracts/habitflow',
    file: 'HabitflowContracts.kt',
    schemas: [
      'HabitSyncResponseSchema',
      'HabitWriteSchema',
      'HabitUpdateSchema',
      'HabitLogWriteSchema',
    ],
  },
];

const KOTLIN_KEYWORDS = new Set([
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
]);

/** `my_usage` and `my usage` both become `MyUsage`. */
export function pascalCase(value) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
}

export function camelCase(value) {
  const pascal = pascalCase(value);
  return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : pascal;
}

/** `UsageStatePayloadSchema` -> `UsageStatePayload`. */
export function typeNameFor(schemaExportName) {
  const name = schemaExportName.endsWith('Schema')
    ? schemaExportName.slice(0, -'Schema'.length)
    : schemaExportName;
  return pascalCase(name);
}

/** A JSON key as a Kotlin property, plus whether it needs `@SerialName`. */
export function propertyNameFor(key) {
  const plain = /^[A-Za-z][A-Za-z0-9_]*$/.test(key);
  if (plain) {
    // A Kotlin keyword is still a legal property name between backticks, and
    // then the wire name and the property name are the same.
    return { name: KOTLIN_KEYWORDS.has(key) ? `\`${key}\`` : key, renamed: false };
  }
  const name = camelCase(key) || 'value';
  return { name, renamed: name !== key };
}

/** `setExpiry` -> `SET_EXPIRY`, `free` -> `FREE`. */
export function enumConstantFor(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase()
    .replace(/^_+|_+$/g, '');
}

function unsupported(path, node) {
  return new Error(
    `generate-contracts: ${path} is not representable as a Kotlin type ` +
      `(${JSON.stringify(node).slice(0, 120)}). Widen the generator rather than the app.`
  );
}

/** Strip the `null` arm of a union, reporting whether one was there. */
function withoutNull(node) {
  const arms = node.anyOf ?? node.oneOf;
  if (Array.isArray(arms)) {
    const rest = arms.filter((arm) => arm.type !== 'null');
    return {
      node: rest.length === 1 ? rest[0] : { ...node, anyOf: rest },
      nullable: rest.length !== arms.length,
    };
  }
  if (Array.isArray(node.type)) {
    const rest = node.type.filter((type) => type !== 'null');
    if (rest.length !== node.type.length) {
      const next = { ...node, type: rest.length === 1 ? rest[0] : rest };
      delete next.enum;
      return { node: next, nullable: true };
    }
  }
  return { node, nullable: false };
}

/**
 * Walk one JSON Schema and collect Kotlin declarations. Pure: same input, same
 * output, no filesystem access — which is what the unit tests drive.
 */
export function emitKotlin(rootSchema, rootName) {
  const declarations = [];
  const usedNames = new Set();
  let usesSerialName = false;

  function claimName(base) {
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    return name;
  }

  function kotlinType(node, nameHint, jsonPath) {
    const { node: inner, nullable } = withoutNull(node);

    let reference;
    if (inner.$ref) {
      reference = inner.$ref.split('/').pop();
    } else if (Array.isArray(inner.enum)) {
      reference = emitEnum(inner.enum, nameHint, jsonPath);
    } else if (inner.type === 'string') {
      reference = 'String';
    } else if (inner.type === 'integer') {
      reference = 'Long';
    } else if (inner.type === 'number') {
      reference = 'Double';
    } else if (inner.type === 'boolean') {
      reference = 'Boolean';
    } else if (inner.type === 'array') {
      if (!inner.items) {
        throw unsupported(jsonPath, inner);
      }
      reference = `List<${kotlinType(inner.items, `${nameHint}Item`, `${jsonPath}[]`)}>`;
    } else if (inner.type === 'object' && inner.properties) {
      reference = emitDataClass(inner, nameHint, jsonPath);
    } else if (inner.type === 'object' && inner.additionalProperties) {
      const values = inner.additionalProperties === true ? null : inner.additionalProperties;
      if (!values) {
        throw unsupported(jsonPath, inner);
      }
      reference = `Map<String, ${kotlinType(values, `${nameHint}Value`, `${jsonPath}{}`)}>`;
    } else {
      throw unsupported(jsonPath, inner);
    }

    return nullable ? `${reference}?` : reference;
  }

  function emitEnum(values, nameHint, jsonPath) {
    if (!values.every((value) => typeof value === 'string')) {
      throw unsupported(jsonPath, { enum: values });
    }
    const name = claimName(nameHint);
    const constants = values.map((value) => {
      usesSerialName = true;
      return `    @SerialName("${value}") ${enumConstantFor(value)},`;
    });
    declarations.push(['enum', name, constants]);
    return name;
  }

  function emitDataClass(node, nameHint, jsonPath) {
    const name = claimName(nameHint);
    const required = new Set(node.required ?? []);
    const entries = Object.entries(node.properties);

    // Declare the parent before its children so the file reads top-down.
    const index = declarations.length;
    declarations.push(['class', name, []]);

    const properties = entries.map(([key, property]) => {
      const { name: propertyName, renamed } = propertyNameFor(key);
      if (renamed) {
        usesSerialName = true;
      }
      const optional = !required.has(key);
      const type = kotlinType(property, `${name}${pascalCase(key)}`, `${jsonPath}.${key}`);
      const defaulted =
        optional && !type.endsWith('?') ? `${type}? = null` : optional ? `${type} = null` : type;
      const annotation = renamed ? `@SerialName("${key}") ` : '';
      return `    ${annotation}val ${propertyName}: ${defaulted},`;
    });

    declarations[index] = ['class', name, properties];
    return name;
  }

  const rootReference = kotlinType(rootSchema, rootName, rootName);
  return { rootReference, declarations, usesSerialName };
}

/** Assemble one Kotlin file: header, package, imports, declarations. */
export function renderKotlinFile(declarations, { usesSerialName, sourceModule }) {
  const lines = [
    '// Generated by `npm run contracts:generate` from the Zod schemas in',
    `// \`${sourceModule}\`. Do not edit: change the schema and regenerate.`,
    '// `npm run check:contracts` fails when this file is stale, and the build',
    '// fails when a schema field this file carries is removed or renamed.',
    `package ${PACKAGE}`,
    '',
    'import kotlinx.serialization.Serializable',
  ];
  if (usesSerialName) {
    lines.push('import kotlinx.serialization.SerialName');
  }

  for (const [kind, name, body] of declarations) {
    lines.push('', '@Serializable');
    if (kind === 'enum') {
      lines.push(`enum class ${name} {`);
      lines.push(...body);
      lines.push('}');
    } else {
      lines.push(`data class ${name}(`);
      lines.push(...body);
      lines.push(')');
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Load the schemas through esbuild, which resolves `@/` and strips types. */
async function loadSchemas() {
  const imports = CONTRACTS.map((contract, index) => {
    const specifier = contract.module.startsWith('.') ? contract.module : `./${contract.module}`;
    return `import * as module${index} from '${specifier}';`;
  });
  const exports = CONTRACTS.flatMap((contract, index) =>
    contract.schemas.map(
      (schema) => `  ${JSON.stringify(schema)}: module${index}[${JSON.stringify(schema)}],`
    )
  );
  const entry = [...imports, '', 'export const schemas = {', ...exports, '};', ''].join('\n');

  const directory = await mkdtemp(path.join(tmpdir(), 'roy-contracts-'));
  const outfile = path.join(directory, 'entry.mjs');
  try {
    // Imported lazily so the emitters below can be unit-tested without esbuild,
    // which refuses to load inside a DOM environment.
    const { build } = await import('esbuild');
    await build({
      stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      alias: { '@': ROOT },
      outfile,
      logLevel: 'silent',
    });
    const loaded = await import(pathToFileURL(outfile).href);
    return loaded.schemas;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The generated files, keyed by file name, without touching the disk. */
export async function generate() {
  const schemas = await loadSchemas();
  const { z } = await import('zod');
  const files = new Map();

  for (const contract of CONTRACTS) {
    const declarations = [];
    let usesSerialName = false;

    for (const schemaName of contract.schemas) {
      const schema = schemas[schemaName];
      if (!schema) {
        throw new Error(`generate-contracts: ${contract.module} has no export ${schemaName}`);
      }
      const jsonSchema = z.toJSONSchema(schema, {
        target: 'draft-2020-12',
        io: 'output',
        unrepresentable: 'throw',
      });
      const emitted = emitKotlin(jsonSchema, typeNameFor(schemaName));
      declarations.push(...emitted.declarations);
      usesSerialName = usesSerialName || emitted.usesSerialName;
    }

    files.set(
      contract.file,
      renderKotlinFile(declarations, { usesSerialName, sourceModule: contract.module })
    );
  }

  return files;
}

async function readGeneratedDirectory() {
  try {
    return await readdir(OUTPUT_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function main(argv) {
  const check = argv.includes('--check');
  const files = await generate();

  if (!check) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    for (const [file, contents] of files) {
      await writeFile(path.join(OUTPUT_DIR, file), contents, 'utf8');
    }
    // A renamed module leaves its old file behind, and a stale file still
    // compiles, so remove anything this run did not produce.
    for (const file of await readGeneratedDirectory()) {
      if (file.endsWith('.kt') && !files.has(file)) {
        await rm(path.join(OUTPUT_DIR, file));
      }
    }
    return 0;
  }

  const stale = [];
  for (const [file, contents] of files) {
    let onDisk = null;
    try {
      onDisk = await readFile(path.join(OUTPUT_DIR, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (onDisk !== contents) {
      stale.push(file);
    }
  }
  for (const file of await readGeneratedDirectory()) {
    if (file.endsWith('.kt') && !files.has(file)) {
      stale.push(file);
    }
  }

  if (stale.length > 0) {
    process.stderr.write(
      `Generated contracts are stale: ${stale.join(', ')}\n` +
        'Run `npm run contracts:generate` and commit the result.\n'
    );
    return 1;
  }

  return 0;
}

if (SCRIPT_PATH && process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
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

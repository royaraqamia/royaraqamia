import { readFileSync } from 'fs';
import { resolve } from 'path';

const ENV_TEMPLATE = resolve('example.env');
const README = resolve('README.md');

const envTemplate = readFileSync(ENV_TEMPLATE, 'utf8');
const readme = readFileSync(README, 'utf8');

const templateKeys = new Set([...envTemplate.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

const readmeKeys = new Set([...readme.matchAll(/^\| `([A-Z][A-Z0-9_]*)`/gm)].map((m) => m[1]));

const undocumentedInReadme = [...templateKeys].filter((k) => !readmeKeys.has(k));
const undocumentedInTemplate = [...readmeKeys].filter((k) => !templateKeys.has(k));

let failed = false;

if (undocumentedInReadme.length > 0) {
  failed = true;
  console.error(
    'ERROR: Keys present in example.env but missing from the README environment table:'
  );
  for (const key of undocumentedInReadme) {
    console.error(`  - ${key}`);
  }
}

if (undocumentedInTemplate.length > 0) {
  failed = true;
  console.error(
    'ERROR: Keys documented in the README environment table but missing from example.env:'
  );
  for (const key of undocumentedInTemplate) {
    console.error(`  - ${key}`);
  }
}

if (failed) {
  console.error(
    `\nKeep example.env and the README "Environment Variables" table in sync, then re-run.`
  );
  process.exit(1);
}

console.log(
  `OK: all ${templateKeys.size} example.env keys are documented in README.md (${readmeKeys.size} documented keys).`
);

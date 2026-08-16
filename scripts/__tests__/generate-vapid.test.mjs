import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'generate-vapid.mjs');

function runScript() {
  return execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
}

describe('generate-vapid.mjs', () => {
  it('prints an env-ready VAPID key pair', () => {
    const output = runScript();

    const publicKey = output.match(/^NEXT_PUBLIC_VAPID_PUBLIC_KEY=(.+)$/m)?.[1];
    const privateKey = output.match(/^VAPID_PRIVATE_KEY=(.+)$/m)?.[1];

    expect(publicKey).toBeDefined();
    expect(privateKey).toBeDefined();
    expect(publicKey?.length).toBe(87);
    expect(privateKey?.length).toBe(43);
    expect(output).toContain('VAPID_SUBJECT');
  });
});
import fs from 'fs';
import path from 'path';
import os from 'os';

let cachedDir: string | null = null;

export function getDataDir(): string {
  if (cachedDir) return cachedDir;

  const envDir = process.env.DATA_DIR;
  if (envDir) {
    cachedDir = envDir;
    return cachedDir;
  }

  const cwd = process.cwd();
  const candidate = path.join(cwd, 'data');
  try {
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate, { recursive: true });
    }
    fs.accessSync(candidate, fs.constants.W_OK);
    cachedDir = candidate;
    return cachedDir;
  } catch {
    const fallback = path.join(os.tmpdir(), 'habitflow-data');
    cachedDir = fallback;
    return cachedDir;
  }
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'habits_db.json');
}

export function resetCache(): void {
  cachedDir = null;
}

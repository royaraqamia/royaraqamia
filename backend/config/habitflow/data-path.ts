import fs from 'fs';
import path from 'path';
import os from 'os';
import { env } from '@/backend/config/env';

let cachedDir: string | null = null;

function getDataDir(): string {
  if (cachedDir) return cachedDir;

  const envDir = env.dataDir;
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
    const fallback = path.join(os.homedir(), '.habitflow', 'data');
    try {
      if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true, mode: 0o700 });
      }
      fs.chmodSync(fallback, 0o700);
      fs.accessSync(fallback, fs.constants.W_OK);
      cachedDir = fallback;
      return cachedDir;
    } catch {
      throw new Error('Unable to initialize a secure fallback data directory');
    }
  }
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'habits_db.json');
}

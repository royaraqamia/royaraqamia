import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDbPath } from '@/domains/habitflow/shared/data-path';

const DB_FILE = getDbPath();

export async function GET(_req: NextRequest) {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({ habits: [], logs: [], count: 0 });
    }

    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(content);
    const habits = data.habits || [];
    const logs = data.logs || [];

    return NextResponse.json({ habits, logs, count: habits.length });
  } catch {
    return NextResponse.json({ habits: [], logs: [], count: 0 });
  }
}

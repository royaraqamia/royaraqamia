import { describe, expect, it } from 'vitest';
import {
  TABLE_FLOORS,
  countMismatches,
  floorViolations,
  parseCopyRowCounts,
  sizeViolations,
} from '../backup-contract.mjs';

const dump = `--
-- PostgreSQL database dump
--

COPY public.users (id, email) FROM stdin;
1\tone@example.com
2\ttwo@example.com
\\.

COPY "public"."chat_messages" (id, body) FROM stdin;
7\tsalam
8\tafwan
9\tmarhaban
\\.

COPY public.notifications (id) FROM stdin;
\\.
`;

describe('database backup contract (#1700)', () => {
  it('counts rows inside COPY blocks without a database', () => {
    const counts = parseCopyRowCounts(dump);
    expect(counts.get('public.users')).toBe(2);
    expect(counts.get('public.chat_messages')).toBe(3);
    expect(counts.get('public.notifications')).toBe(0);
  });

  it('fails a dump whose recorded tables fall below their floor', () => {
    const counts = new Map([
      ['public.users', 24],
      ['public.notifications', 9999],
      ['public.chat_messages', 96],
      ['public.chat_attachments', 8],
      ['public.schema_migrations', 255],
    ]);
    expect(floorViolations(counts)).toEqual(['public.notifications: 9999 rows, floor 10000']);
  });

  it('fails a dump that lost a recorded table altogether', () => {
    const counts = new Map(Object.entries(TABLE_FLOORS));
    counts.delete('public.chat_attachments');
    expect(floorViolations(counts)).toEqual(['public.chat_attachments: absent from dump']);
  });

  it('compares restored counts exactly against the artifact', () => {
    const expected = { 'public.users': 24, 'public.notifications': 11225 };
    expect(
      countMismatches({ 'public.users': 24, 'public.notifications': 11225 }, expected)
    ).toEqual([]);
    expect(
      countMismatches({ 'public.users': 23, 'public.notifications': 11225 }, expected)
    ).toEqual(['public.users: restored 23, artifact 24']);
    expect(countMismatches({ 'public.users': 24 }, expected)).toEqual([
      'public.notifications: restored undefined, artifact 11225',
    ]);
  });

  it('rejects a missing or undersized dump file', () => {
    expect(sizeViolations({ 'schema.sql': 30000 }, { 'schema.sql': 20000 })).toEqual([]);
    expect(sizeViolations({ 'schema.sql': 10 }, { 'schema.sql': 20000 })).toEqual([
      'schema.sql: 10 bytes, floor 20000',
    ]);
    expect(sizeViolations({}, { 'data.sql': 50000 })).toEqual(['data.sql: missing']);
  });
});

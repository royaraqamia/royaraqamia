import { createHash } from 'node:crypto';

/**
 * The vectors behind the specialist shortlist, as one file on disk.
 *
 * They are int8, base64, and normalised before they are quantised: 283
 * descriptions x 1024 dimensions is 1.1 MB as float32 and about 290 KB here,
 * and cosine over unit vectors is a dot product either way. The error a
 * rounding introduces is far below the gap between the fifth and sixth
 * specialist, and the routing fixtures measure that rather than assert it
 * (#1448).
 *
 * Nothing in this module reads the network or the roster. The builder writes
 * what `encodeVectors` answers, the turn reads what `decodeVectors` answers, and
 * one test runs a fixture through both to prove the ranking survives.
 */

/** The artifact, as the builder writes it and the turn reads it. */
export interface SkillIndexFile {
  /** Bumped when the encoding changes; an unknown version is a lexical turn. */
  version: 1;
  /** The model that produced the vectors (`@cf/baai/bge-m3`), for the operator. */
  model: string;
  /** The width every vector in `vectors` carries. */
  dimensions: number;
  /** How many vectors `vectors` carries. */
  count: number;
  /** sha256 of the roster's ids, names and descriptions, in order. */
  rosterHash: string;
  /** `int8`, little-endian per value, base64 so one line is one file. */
  encoding: 'int8';
  vectors: string;
}

/** Unit length, then the full int8 range: the largest value a vector holds is 1. */
export function encodeVectors(vectors: readonly number[][]): string {
  const length = vectors.reduce((total, vector) => total + vector.length, 0);
  const bytes = Buffer.alloc(length);

  let at = 0;
  for (const vector of vectors) {
    const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
    for (const value of vector) {
      const unit = value / norm;
      const quantised = Math.max(-127, Math.min(127, Math.round(unit * 127)));
      bytes.writeInt8(quantised, at);
      at += 1;
    }
  }

  return bytes.toString('base64');
}

/**
 * One flat vector per row, or `null` when the file cannot be believed.
 *
 * A width that does not divide the payload, a count that does not match, or a
 * malformed encoding is a deployment answering lexically — the turn never fails
 * because a file is short (#1448).
 */
export function decodeVectors(
  payload: string,
  dimensions: number,
  count: number
): Int8Array | null {
  if (!Number.isInteger(dimensions) || dimensions <= 0) return null;
  if (!Number.isInteger(count) || count <= 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return null;

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length !== dimensions * count) return null;
  return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** Cosine of two quantised vectors, read out of the flat array by row. */
export function cosineAtIndex(
  flat: Int8Array,
  dimensions: number,
  index: number,
  query: ArrayLike<number>
): number {
  const start = index * dimensions;
  let dot = 0;
  let left = 0;
  let right = 0;

  for (let offset = 0; offset < dimensions; offset += 1) {
    const stored = (flat[start + offset] ?? 0) / 127;
    const value = query[offset] ?? 0;
    dot += stored * value;
    left += stored * stored;
    right += value * value;
  }

  if (left === 0 || right === 0) return 0;
  return dot / Math.sqrt(left * right);
}

/**
 * The roster's identity, as a hash: the file is only trustworthy for the
 * descriptions it was built from. A description edited without a rebuild is a
 * stale index, and stale routing is worse than lexical routing.
 */
export function rosterHash(
  skills: readonly { id: string; name: string; description: string }[]
): string {
  const hash = createHash('sha256');
  for (const skill of [...skills].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(`${skill.id}\u0000${skill.name}\u0000${skill.description}\n`);
  }
  return hash.digest('hex');
}

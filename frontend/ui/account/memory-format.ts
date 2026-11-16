import type {
  AgentMemoryFact,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@/shared/contracts/agent-memory';

/**
 * How the memory page reads a fact's date (#1428).
 *
 * Same rendering rule as the recall citation (`formatMemoryDate` in the domain):
 * the member's language, the Gregorian calendar and Latin digits, because the
 * site writes every numeral as ASCII. Kept beside the view rather than imported
 * from the backend: a domain module that carries the write path's refusals has no
 * business in a client bundle.
 */
const MEMORY_DATE = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  calendar: 'gregory',
});

export function memoryDate(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at) ? MEMORY_DATE.format(at) : '';
}

/** The facts of one scope, newest first, as the page draws them. */
export function factsOfScope(
  facts: readonly AgentMemoryFact[],
  scope: AgentMemoryScope
): AgentMemoryFact[] {
  return facts.filter((fact) => fact.scope === scope);
}

/** The kinds that get a badge: a plain fact is the default and needs none. */
export function kindNeedsBadge(kind: AgentMemoryKind): boolean {
  return kind !== 'fact';
}

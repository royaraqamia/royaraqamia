import { ASSISTANT_DEFAULT_NAME } from '@/shared/contracts/assistant-identity-constants';

/** The name the site paints: the member's choice, or the deployment default (ADR-0229). */
export function assistantNameOr(name: string | null | undefined): string {
  return name?.trim() || ASSISTANT_DEFAULT_NAME;
}

/** Fill a copy string's `{name}` with the name this client knows (ADR-0229). */
export function assistantNameIn(template: string, name: string | null | undefined): string {
  return template.replace('{name}', assistantNameOr(name));
}

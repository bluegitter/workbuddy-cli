export type PermissionBehavior = 'allow' | 'deny' | 'ask' | string;

export interface PermissionDecision {
  behavior?: PermissionBehavior;
  updatedInput?: unknown;
  [key: string]: unknown;
}

export interface NormalizedPermissionDecision extends PermissionDecision {
  behavior: PermissionBehavior;
  updatedInput: unknown;
}

export function normalizePermissionDecision(
  decision: unknown,
  fallbackInput: unknown,
): NormalizedPermissionDecision {
  const result: PermissionDecision = decision && typeof decision === 'object'
    ? decision as PermissionDecision
    : {};
  const behavior = result.behavior || 'deny';
  const updatedInput = result.updatedInput === undefined
    ? fallbackInput
    : result.updatedInput;
  return { ...result, behavior, updatedInput };
}

export function getPermissionInput(
  decision: PermissionDecision | null | undefined,
  fallbackInput: unknown,
): unknown {
  return decision?.updatedInput === undefined ? fallbackInput : decision.updatedInput;
}

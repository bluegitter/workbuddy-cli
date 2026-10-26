export interface ToolPermissionResult {
  behavior: string;
  updatedInput?: unknown;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  execute: (...args: unknown[]) => unknown;
  backfillObservableInput?: (input: unknown) => unknown;
  parseInput?: (input: unknown) => unknown;
  validateInput?: (input: unknown, context?: unknown) => Promise<unknown> | unknown;
  checkPermissions?: (input: unknown, context?: unknown) => Promise<ToolPermissionResult> | ToolPermissionResult;
  isConcurrencySafe?: () => boolean;
  mutatesState?: boolean;
  delegationSafe?: boolean;
  autoApprove?: boolean;
  [key: string]: unknown;
}

export const TOOL_DEFAULTS = Object.freeze({
  backfillObservableInput: () => undefined,
  parseInput: (input: unknown) => input,
  validateInput: async () => ({ result: true }),
  checkPermissions: async (input: unknown) => ({ behavior: 'allow', updatedInput: input }),
  isConcurrencySafe: () => false,
  mutatesState: false,
  delegationSafe: false,
  autoApprove: false,
});

export type BuiltTool = ToolDefinition & Required<Pick<
  ToolDefinition,
  'backfillObservableInput' | 'parseInput' | 'validateInput' | 'checkPermissions'
  | 'isConcurrencySafe' | 'mutatesState' | 'delegationSafe' | 'autoApprove'
>>;

export function buildTool(definition: ToolDefinition): BuiltTool {
  if (!definition || typeof definition.name !== 'string' || typeof definition.execute !== 'function') {
    throw new TypeError('tool must define a name and execute function');
  }
  return Object.freeze({ ...TOOL_DEFAULTS, ...definition }) as BuiltTool;
}

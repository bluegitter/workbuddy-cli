export type MessageContent = string | readonly ContentBlock[];

export interface ContentBlock {
  type?: string;
  id?: string;
  tool_use_id?: string;
  name?: string;
  toolName?: string;
  input?: unknown;
  arguments?: unknown;
  rawInput?: unknown;
  [key: string]: unknown;
}

export interface AgentMessage {
  type: string;
  role: string;
  content: MessageContent;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolCall {
  id?: string;
  name?: string;
  input: Record<string, unknown>;
}

export interface ModelResponse extends Record<string, unknown> {
  content?: MessageContent;
  message?: AgentMessage;
  toolCalls?: ToolCall[];
  stopReason?: string;
  stop_reason?: string;
  metadata?: {
    stopReason?: string;
    stop_reason?: string;
    [key: string]: unknown;
  };
}

export interface ProgressMessage {
  type: 'progress';
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function assistantMessage(
  content: MessageContent,
  metadata: Record<string, unknown> = {},
): AgentMessage {
  return { type: 'assistant', role: 'assistant', content, metadata };
}

export function userMessage(
  content: MessageContent,
  metadata: Record<string, unknown> = {},
): AgentMessage {
  return { type: 'user', role: 'user', content, metadata };
}

export function progressMessage(
  event: string,
  data: Record<string, unknown> = {},
): ProgressMessage {
  return { type: 'progress', event, data, timestamp: Date.now() };
}

export function normalizeModelResponse(response: ModelResponse): ModelResponse & {
  message: AgentMessage;
  toolCalls: ToolCall[];
  stopReason?: string;
} {
  if (!response || typeof response !== 'object') {
    throw new TypeError('model response must be an object');
  }
  const message = response.message || assistantMessage(response.content || '');
  const toolCalls = response.toolCalls || extractToolCalls(message.content);
  const stopReason = response.stopReason
    || response.stop_reason
    || response.metadata?.stopReason
    || response.metadata?.stop_reason;
  return { ...response, message, toolCalls, stopReason };
}

export function extractToolCalls(content: MessageContent): ToolCall[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === 'tool_use')
    .map((block) => ({
      id: block.id || block.tool_use_id,
      name: block.name || block.toolName,
      input: normalizeToolInput(block.input ?? block.arguments ?? block.rawInput),
    }));
}

export function normalizeToolInput(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid arguments are handled by the tool parser and surfaced as a result.
    }
  }
  return {};
}

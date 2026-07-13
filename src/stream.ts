export const StreamEventType = {
  Question: "question",
  Thinking: "thinking",
  ThinkingDelta: "thinking_delta",
  ToolCall: "tool_call",
  ToolResult: "tool_result",
  Answer: "answer",
  AnswerDelta: "answer_delta",
  Error: "error",
} as const;

export type StreamEventTypeValue = (typeof StreamEventType)[keyof typeof StreamEventType];

export class StreamEvent {
  type: StreamEventTypeValue;
  content: string | null;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;

  constructor(options: {
    type: StreamEventTypeValue;
    content?: string | null;
    toolName?: string | null;
    toolArgs?: Record<string, unknown> | null;
    toolResult?: string | null;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    this.type = options.type;
    this.content = options.content ?? null;
    this.toolName = options.toolName ?? null;
    this.toolArgs = options.toolArgs ?? null;
    this.toolResult = options.toolResult ?? null;
    this.error = options.error ?? null;
    this.metadata = options.metadata ?? null;
  }

  static question(content: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.Question, content });
  }

  static thinking(content: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.Thinking, content });
  }

  static thinkingDelta(content: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.ThinkingDelta, content });
  }

  static toolCall(toolName: string, toolArgs: Record<string, unknown>): StreamEvent {
    return new StreamEvent({ type: StreamEventType.ToolCall, toolName, toolArgs });
  }

  static createToolResult(toolName: string, result: unknown): StreamEvent {
    const toolResult = typeof result === "string" ? result : JSON.stringify(result);
    return new StreamEvent({ type: StreamEventType.ToolResult, toolName, toolResult });
  }

  static answer(content: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.Answer, content });
  }

  static answerDelta(content: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.AnswerDelta, content });
  }

  static createError(error: string): StreamEvent {
    return new StreamEvent({ type: StreamEventType.Error, error });
  }
}


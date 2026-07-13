export type Role = "system" | "user" | "assistant" | "tool" | string;

export interface ToolCall {
  id?: string;
  type?: "function" | string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: Role;
  content?: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export class Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  constructor(inputTokens = 0, outputTokens = 0, totalTokens = 0) {
    this.inputTokens = inputTokens;
    this.outputTokens = outputTokens;
    this.totalTokens = totalTokens;
  }

  add(other: Usage): void {
    this.inputTokens += other.inputTokens;
    this.outputTokens += other.outputTokens;
    this.totalTokens += other.totalTokens;
  }

  clone(): Usage {
    return new Usage(this.inputTokens, this.outputTokens, this.totalTokens);
  }
}

function makeContextId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class Context {
  messages: Message[];
  usage: Usage;
  data: Record<string, unknown>;
  contextId: string;
  createdAt: Date;
  lastAgent: string | null;
  turnCount: number;

  constructor() {
    this.messages = [];
    this.usage = new Usage();
    this.data = {};
    this.contextId = makeContextId();
    this.createdAt = new Date();
    this.lastAgent = null;
    this.turnCount = 0;
  }

  addMessage(role: Role, content: string | null, extra: Record<string, unknown> = {}): void {
    this.messages.push({ role, content, ...extra });
  }

  addToolCall(toolName: string, arguments_: Record<string, unknown>, result: unknown): void {
    const argumentsJson = JSON.stringify(arguments_);
    const resultContent = typeof result === "string" ? result : JSON.stringify(result);

    let toolCallId = `call_${this.messages.length}`;
    const lastMessage = this.messages.at(-1);

    if (lastMessage?.role === "assistant" && Array.isArray(lastMessage.tool_calls)) {
      toolCallId = `call_${this.messages.length}`;
      lastMessage.tool_calls.push({
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: argumentsJson },
      });
    } else {
      let thinkingContent: string | null = null;
      if (lastMessage?.role === "assistant" && !lastMessage.tool_calls) {
        const removed = this.messages.pop();
        thinkingContent = typeof removed?.content === "string" ? removed.content : null;
      }

      toolCallId = `call_${this.messages.length}`;
      this.messages.push({
        role: "assistant",
        content: thinkingContent,
        tool_calls: [
          {
            id: toolCallId,
            type: "function",
            function: { name: toolName, arguments: argumentsJson },
          },
        ],
      });
    }

    this.messages.push({
      role: "tool",
      name: toolName,
      content: resultContent,
      tool_call_id: toolCallId,
    });
  }

  getMessagesForApi(): Message[] {
    return [...this.messages];
  }

  setData(key: string, value: unknown): void {
    this.data[key] = value;
  }

  getData<T = unknown>(key: string, defaultValue: T | null = null): T | null {
    return Object.prototype.hasOwnProperty.call(this.data, key)
      ? (this.data[key] as T)
      : defaultValue;
  }

  clearMessages(): void {
    this.messages = [];
    this.turnCount = 0;
  }

  getSummary(): Record<string, unknown> {
    return {
      contextId: this.contextId,
      createdAt: this.createdAt.toISOString(),
      lastAgent: this.lastAgent,
      turnCount: this.turnCount,
      messageCount: this.messages.length,
      totalTokens: this.usage.totalTokens,
    };
  }

  clone(): Context {
    const cloned = new Context();
    cloned.messages = cloneValue(this.messages);
    cloned.usage = this.usage.clone();
    cloned.data = cloneValue(this.data);
    cloned.contextId = this.contextId;
    cloned.createdAt = new Date(this.createdAt);
    cloned.lastAgent = this.lastAgent;
    cloned.turnCount = this.turnCount;
    return cloned;
  }

  toString(): string {
    return `Context(id=${this.contextId.slice(0, 8)}..., messages=${this.messages.length}, turns=${this.turnCount}, usage=${this.usage.totalTokens})`;
  }
}


import { Model, Usage } from "../src/index.ts";
import type { Message, ModelResponse, StreamDelta, ToolCall, ToolSchema } from "../src/index.ts";

type ResponseFactory = (messages: Message[], tools?: ToolSchema[] | null) => ModelResponse;

export class DemoModel extends Model {
  private readonly factory: ResponseFactory;

  constructor(factory: ResponseFactory) {
    super();
    this.factory = factory;
  }

  async generate(messages: Message[], tools?: ToolSchema[] | null): Promise<ModelResponse> {
    return this.factory(messages, tools);
  }

  override async *generateStream(
    messages: Message[],
    tools?: ToolSchema[] | null,
  ): AsyncGenerator<StreamDelta | ModelResponse, void, void> {
    const response = await this.generate(messages, tools);
    if (response.content) {
      for (const char of response.content) {
        yield { content: char };
      }
    }
    yield response;
  }
}

export function textResponse(content: string): ModelResponse {
  return {
    content,
    toolCalls: null,
    usage: new Usage(12, 24, 36),
    finishReason: "stop",
  };
}

export function toolResponse(content: string, name: string, args: Record<string, unknown>): ModelResponse {
  const toolCall: ToolCall = {
    id: `call_${name}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };

  return {
    content,
    toolCalls: [toolCall],
    usage: new Usage(16, 8, 24),
    finishReason: "tool_calls",
  };
}

export function lastUserMessage(messages: Message[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  return String(userMessage?.content ?? "");
}

export function hasToolResult(messages: Message[], toolName: string): boolean {
  return messages.some((message) => message.role === "tool" && message.name === toolName);
}

export function latestToolMessage(messages: Message[]): Message | null {
  const message = messages.at(-1);
  return message?.role === "tool" ? message : null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

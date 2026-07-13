import { Usage } from "./context.ts";
import type { Message, ToolCall } from "./context.ts";
import type { ToolSchema } from "./tool.ts";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

export interface ModelResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  usage: Usage;
  finishReason: string;
}

export interface StreamDelta {
  content?: string | null;
  toolCalls?: ToolCall[] | null;
  finishReason?: string | null;
}

export abstract class Model {
  abstract generate(messages: Message[], tools?: ToolSchema[] | null): Promise<ModelResponse>;

  async *generateStream(
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

export interface OpenAIModelOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  extra?: Record<string, unknown>;
}

interface OpenAIChoiceMessage {
  content?: string | null;
  tool_calls?: ToolCall[];
}

interface OpenAIResponse {
  choices: Array<{
    message?: OpenAIChoiceMessage;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function usageFromOpenAI(response: OpenAIResponse): Usage {
  return new Usage(
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    response.usage?.total_tokens ?? 0,
  );
}

export class OpenAIModel extends Model {
  modelName: string;
  apiKey: string | undefined;
  baseUrl: string;
  temperature: number;
  maxTokens: number | undefined;
  fetchImpl: typeof fetch;
  extra: Record<string, unknown>;

  constructor(options: OpenAIModelOptions = {}) {
    super();
    this.modelName = options.model ?? env("MODEL") ?? "gpt-3.5-turbo";
    this.apiKey = options.apiKey ?? env("API_KEY") ?? env("OPENAI_API_KEY");
    this.baseUrl = options.baseUrl ?? env("BASE_URL") ?? "https://api.openai.com/v1";
    this.temperature =
      options.temperature ?? Number.parseFloat(env("TEMPERATURE") ?? "0.7");
    this.maxTokens =
      options.maxTokens ??
      (env("MAX_TOKENS") ? Number.parseInt(env("MAX_TOKENS") ?? "", 10) : undefined);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.extra = options.extra ?? {};
  }

  async generate(messages: Message[], tools?: ToolSchema[] | null): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: this.temperature,
      ...this.extra,
    };

    if (this.maxTokens !== undefined) {
      body.max_tokens = this.maxTokens;
    }
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];
    const message = choice?.message ?? {};

    return {
      content: message.content ?? null,
      toolCalls: message.tool_calls ?? null,
      usage: usageFromOpenAI(data),
      finishReason: choice?.finish_reason ?? "stop",
    };
  }

  async *generateStream(
    messages: Message[],
    tools?: ToolSchema[] | null,
  ): AsyncGenerator<StreamDelta | ModelResponse, void, void> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: this.temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...this.extra,
    };

    if (this.maxTokens !== undefined) {
      body.max_tokens = this.maxTokens;
    }
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI-compatible stream failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const toolCalls: ToolCall[] = [];
    let finishReason = "stop";
    let usage = new Usage();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          continue;
        }

        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string;
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };

        if (chunk.usage) {
          usage = new Usage(
            chunk.usage.prompt_tokens ?? 0,
            chunk.usage.completion_tokens ?? 0,
            chunk.usage.total_tokens ?? 0,
          );
        }

        const choice = chunk.choices?.[0];
        if (!choice) {
          continue;
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const content = choice.delta?.content;
        if (content) {
          fullContent += content;
          yield { content };
        }

        for (const delta of choice.delta?.tool_calls ?? []) {
          toolCalls[delta.index] ??= {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          const target = toolCalls[delta.index];
          target.id = delta.id ?? target.id;
          target.type = delta.type ?? target.type;
          target.function.name = delta.function?.name ?? target.function.name;
          target.function.arguments += delta.function?.arguments ?? "";
        }
      }
    }

    yield {
      content: fullContent,
      toolCalls: toolCalls.length ? toolCalls : null,
      usage,
      finishReason,
    };
  }
}

export const LiteLLMModel = OpenAIModel;

import { describe, expect, test } from "vitest";

import {
  Agent,
  Context,
  MCPTool,
  Model,
  Runner,
  StreamEventType,
  Usage,
  functionTool,
} from "../src/index.ts";
import type {
  Message,
  ModelResponse,
  StreamDelta,
  StreamEventTypeValue,
  ToolSchema,
} from "../src/index.ts";

class QueueModel extends Model {
  responses: ModelResponse[];

  constructor(responses: ModelResponse[]) {
    super();
    this.responses = [...responses];
  }

  async generate(_messages: Message[], _tools?: ToolSchema[] | null): Promise<ModelResponse> {
    const response = this.responses.shift();
    if (!response) {
      throw new Error("No queued response");
    }
    return response;
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

function response(
  content: string,
  toolCalls: ModelResponse["toolCalls"] = null,
  usage = new Usage(1, 2, 3),
): ModelResponse {
  return {
    content,
    toolCalls,
    usage,
    finishReason: toolCalls?.length ? "tool_calls" : "stop",
  };
}

describe("zipagent-ts core", () => {
test("functionTool creates schema and executes positional functions", async () => {
  const add = functionTool((a: number, b: number) => a + b, {
    name: "add",
    description: "Add two numbers.",
    parameters: {
      a: { type: "integer", description: "Left value." },
      b: { type: "integer", description: "Right value." },
    },
  });

  expect(add.name).toBe("add");
  expect(add.schema.function.parameters.properties.a.type).toBe("integer");
  expect(add.schema.function.parameters.required).toEqual(["a", "b"]);

  const result = await add.execute({ a: 2, b: 3 });
  expect(result.success).toBe(true);
  expect(result.result).toBe(5);
});

test("Context stores messages, tool calls, metadata, and deep clones", () => {
  const context = new Context();
  context.addMessage("user", "hello", { name: "tester" });
  context.addToolCall("search", { query: "zipagent" }, { items: [1, 2] });
  context.setData("nested", { value: 1 });
  context.turnCount = 2;

  expect(context.messages[0].name).toBe("tester");
  expect(context.messages.at(-1)?.role).toBe("tool");
  expect(context.getSummary().messageCount).toBe(3);

  const cloned = context.clone();
  const nested = cloned.getData<{ value: number }>("nested");
  expect(nested).not.toBeNull();
  if (!nested) {
    throw new Error("Expected nested data");
  }
  nested.value = 99;

  expect(cloned.messages).not.toBe(context.messages);
  expect(context.getData<{ value: number }>("nested")?.value).toBe(1);
  expect(cloned.contextId).toBe(context.contextId);
});

test("Agent manages tools and system messages", () => {
  const echo = functionTool((message: string) => message, {
    name: "echo",
    parameters: { message: { type: "string" } },
  });
  const agent = new Agent({
    name: "EchoAgent",
    instructions: "Echo user input.",
    model: new QueueModel([]),
    tools: [echo],
    useSystemPrompt: false,
  });

  expect(agent.findTool("echo")).toBe(echo);
  expect(agent.getToolsSchema()[0].function.name).toBe("echo");
  expect(agent.getSystemMessage().content ?? "").toMatch(/echo/);
  expect(agent.removeTool("echo")).toBe(true);
  expect(agent.findTool("echo")).toBeNull();
});

test("Runner handles a simple conversation", async () => {
  const model = new QueueModel([response("Hello from TS")]);
  const agent = new Agent({
    name: "TestAgent",
    instructions: "Be helpful.",
    model,
    useSystemPrompt: false,
  });

  const result = await Runner.run(agent, "hello");

  expect(result.success).toBe(true);
  expect(result.content).toBe("Hello from TS");
  expect(result.context.messages.length).toBe(3);
  expect(result.context.usage.totalTokens).toBe(3);
});

test("Runner executes tool calls and continues to final answer", async () => {
  const add = functionTool((a: number, b: number) => a + b, {
    name: "add",
    parameters: {
      a: { type: "integer" },
      b: { type: "integer" },
    },
  });
  const model = new QueueModel([
    response("Need a tool", [
      {
        type: "function",
        function: { name: "add", arguments: "{\"a\":2,\"b\":3}" },
      },
    ]),
    response("2 + 3 = 5"),
  ]);
  const agent = new Agent({
    name: "Calculator",
    instructions: "Calculate.",
    model,
    tools: [add],
    useSystemPrompt: false,
  });

  const events: StreamEventTypeValue[] = [];
  const result = await Runner.run(agent, "calculate", {
    streamCallback: (event) => {
      events.push(event.type);
    },
  });

  expect(result.success).toBe(true);
  expect(result.content).toBe("2 + 3 = 5");
  expect(result.context.messages.some((message) => message.role === "tool")).toBe(true);
  expect(events.includes(StreamEventType.ToolCall)).toBe(true);
  expect(result.context.usage.totalTokens).toBe(6);
});

test("Runner reports max turns for repeated tool calls", async () => {
  const echo = functionTool((message: string) => message, {
    name: "echo",
    parameters: { message: { type: "string" } },
  });
  const model = new QueueModel([
    response("again", [
      { type: "function", function: { name: "echo", arguments: "{\"message\":\"x\"}" } },
    ]),
    response("again", [
      { type: "function", function: { name: "echo", arguments: "{\"message\":\"x\"}" } },
    ]),
  ]);
  const agent = new Agent({
    name: "Loop",
    instructions: "Loop.",
    model,
    tools: [echo],
  });

  const result = await Runner.run(agent, "start", { maxTurns: 2 });

  expect(result.success).toBe(false);
  expect(result.error ?? "").toMatch(/max turns/);
});

test("MCPTool wraps an arbitrary transport", async () => {
  const group = await MCPTool.fromTransport("mock", {
    async listTools() {
      return [
        {
          name: "lookup",
          description: "Lookup data.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ];
    },
    async callTool(name, arguments_) {
      return `${name}:${arguments_.query}`;
    },
  });

  expect(group.getToolNames()).toEqual(["lookup"]);
  const result = await group.get("lookup")?.execute({ query: "zipagent" });
  expect(result?.result).toBe("lookup:zipagent");
});
});

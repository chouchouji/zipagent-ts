import { Agent, Runner, StreamEventType, functionTool } from "../src/index.ts";
import { DemoModel, hasToolResult, lastUserMessage, textResponse, toolResponse } from "./mock-model.ts";

const getTime = functionTool(
  () => new Date().toLocaleString("zh-CN", { hour12: false }),
  {
    name: "get_time",
    description: "获取当前时间",
  },
);

const addNumbers = functionTool(
  (a: number, b: number) => `${a} + ${b} = ${a + b}`,
  {
    name: "add_numbers",
    description: "两数相加",
    parameters: {
      a: { type: "integer", description: "第一个数字" },
      b: { type: "integer", description: "第二个数字" },
    },
  },
);

function createAgent(): Agent {
  return new Agent({
    name: "TestAgent",
    instructions: "你是一个助手，必须使用工具来回答时间和计算问题。",
    tools: [getTime, addNumbers],
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      if (hasToolResult(messages, "get_time") || hasToolResult(messages, "add_numbers")) {
        return textResponse(`工具结果已获取：${messages.at(-1)?.content ?? ""}`);
      }
      if (question.includes("时间") || question.includes("几点")) {
        return toolResponse("我需要调用时间工具。", "get_time", {});
      }
      return toolResponse("我需要调用加法工具。", "add_numbers", { a: 25, b: 17 });
    }),
  });
}

async function testStreamingTools(): Promise<void> {
  console.log("测试流式工具调用");
  console.log("=".repeat(60));

  const testCases = ["现在几点了？", "帮我计算 25 + 17", "先告诉我现在时间，然后计算 100 + 200"];

  for (const [index, question] of testCases.entries()) {
    console.log(`\n测试 ${index + 1}: ${question}`);
    console.log("-".repeat(60));

    const startedAt = Date.now();
    let firstChunkAt: number | null = null;

    for await (const event of Runner.runStream(createAgent(), question)) {
      const now = Date.now();

      if (event.type === StreamEventType.AnswerDelta) {
        if (firstChunkAt === null) {
          firstChunkAt = now;
          console.log(`TTFB: ${firstChunkAt - startedAt}ms`);
          process.stdout.write("回答: ");
        }
        process.stdout.write(event.content ?? "");
      }
      if (event.type === StreamEventType.ToolCall) {
        console.log(`\n调用工具: ${event.toolName}(${JSON.stringify(event.toolArgs)})`);
      }
      if (event.type === StreamEventType.ToolResult) {
        console.log(`工具结果: ${event.toolResult}`);
      }
      if (event.type === StreamEventType.Answer) {
        console.log(`\n完成，总时间: ${Date.now() - startedAt}ms`);
      }
    }
  }
}

declare const process: {
  stdout: {
    write(value: string): void;
  };
};

await testStreamingTools();

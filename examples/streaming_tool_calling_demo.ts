import { Agent, Context, Runner, StreamEventType, functionTool } from "../src/index.ts";
import type { StreamEvent } from "../src/index.ts";
import { DemoModel, delay, hasToolResult, lastUserMessage, textResponse, toolResponse } from "./mock-model.ts";

const getCurrentTime = functionTool(
  () => new Date().toLocaleString("zh-CN", { hour12: false }),
  {
    name: "get_current_time",
    description: "获取当前时间",
  },
);

const calculate = functionTool(
  (expression: string) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      if (typeof result === "number" && !Number.isFinite(result)) {
        return `计算错误: ${expression} 的结果不是有限数字`;
      }
      return `${expression} = ${result}`;
    } catch (error) {
      return `计算错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "calculate",
    description: "计算数学表达式",
    parameters: {
      expression: { type: "string", description: "数学表达式，如 2 + 3 * 4" },
    },
  },
);

const searchWeather = functionTool(
  async (city: string) => {
    await delay(100);
    return `${city}今天多云，温度 24°C`;
  },
  {
    name: "search_weather",
    description: "查询天气信息",
    parameters: {
      city: { type: "string", description: "城市名称" },
    },
  },
);

const createTodoItem = functionTool(
  (task: string, priority = "medium") => {
    const todoId = Math.floor(1000 + Math.random() * 9000);
    return `已创建待办事项 #${todoId}: ${task} (优先级: ${priority})`;
  },
  {
    name: "create_todo_item",
    description: "创建待办事项",
    parameters: {
      task: { type: "string", description: "任务描述" },
      priority: { type: "string", description: "优先级 low/medium/high" },
    },
    required: ["task"],
  },
);

const getSystemInfo = functionTool(
  () =>
    JSON.stringify(
      {
        runtime: "Node.js",
        platform: "demo",
        cpu: "28%",
        memory: "42%",
      },
      null,
      2,
    ),
  {
    name: "get_system_info",
    description: "获取系统信息",
  },
);

class StreamingEventHandler {
  eventCount = 0;
  currentAnswer = "";

  handle(event: StreamEvent): void {
    this.eventCount += 1;

    if (event.type === StreamEventType.Question) {
      console.log(`\n用户问题: ${event.content}`);
      console.log("-".repeat(80));
    }
    if (event.type === StreamEventType.AnswerDelta) {
      this.currentAnswer += event.content ?? "";
      process.stdout.write(event.content ?? "");
    }
    if (event.type === StreamEventType.Thinking) {
      console.log(`\n思考完成: ${event.content}`);
    }
    if (event.type === StreamEventType.ToolCall) {
      console.log(`\n调用工具: ${event.toolName}`);
      console.log(`参数: ${JSON.stringify(event.toolArgs)}`);
    }
    if (event.type === StreamEventType.ToolResult) {
      console.log(`工具结果: ${event.toolResult}`);
      console.log("-".repeat(80));
    }
    if (event.type === StreamEventType.Answer) {
      console.log(`\n回答完成，共 ${event.content?.length ?? 0} 字符`);
      console.log("-".repeat(80));
    }
    if (event.type === StreamEventType.Error) {
      console.log(`错误: ${event.error}`);
    }
  }
}

function createAgent(): Agent {
  return new Agent({
    name: "StreamingToolAgent",
    instructions: "你是一个智能助手，能够使用多种工具来帮助用户。请用中文回答。",
    tools: [getCurrentTime, calculate, searchWeather, createTodoItem, getSystemInfo],
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      const latestTool = [...messages].reverse().find((message) => message.role === "tool");

      if (latestTool) {
        return textResponse(`我已经拿到工具结果：${latestTool.content}`);
      }
      if (question.includes("系统信息")) {
        return toolResponse("我先查看系统信息。", "get_system_info", {});
      }
      if (question.includes("几点") || question.includes("时间")) {
        return toolResponse("我先获取当前时间。", "get_current_time", {});
      }
      if (question.includes("天气")) {
        return toolResponse("我先查询天气。", "search_weather", { city: "北京" });
      }
      if (question.includes("待办")) {
        return toolResponse("我将创建待办事项。", "create_todo_item", {
          task: "根据天气准备合适的衣服",
          priority: "high",
        });
      }
      return toolResponse("我先计算表达式。", "calculate", { expression: "(25 + 35) * 2" });
    }),
    useSystemPrompt: true,
  });
}

async function runWithHandler(question: string, context?: Context): Promise<void> {
  const handler = new StreamingEventHandler();
  for await (const event of Runner.runStream(createAgent(), question, { context })) {
    handler.handle(event);
  }
}

async function testSimpleToolCall(): Promise<void> {
  console.log("测试1: 简单工具调用");
  console.log("=".repeat(100));
  await runWithHandler("现在几点了？");
}

async function testCalculationTool(): Promise<void> {
  console.log("\n测试2: 数学计算工具");
  console.log("=".repeat(100));
  await runWithHandler("帮我计算 (25 + 35) * 2 的结果");
}

async function testMultipleToolCalls(): Promise<void> {
  console.log("\n测试3: 多工具协作");
  console.log("=".repeat(100));
  await runWithHandler("帮我查一下北京的天气，然后创建一个高优先级的待办事项");
}

async function testComplexWorkflow(): Promise<void> {
  console.log("\n测试4: 复杂工作流");
  console.log("=".repeat(100));
  const context = new Context();
  await runWithHandler("先帮我看看系统信息，然后告诉我现在时间", context);
  console.log(`上下文消息数: ${context.messages.length}`);
}

async function testErrorHandling(): Promise<void> {
  console.log("\n测试5: 错误处理");
  console.log("=".repeat(100));
  const result = await calculate.execute({ expression: "1 / 0" });
  console.log(result.success ? result.result : result.error);
  console.log(`是否已有工具结果: ${hasToolResult([], "calculate")}`);
}

async function main(): Promise<void> {
  await testSimpleToolCall();
  await testCalculationTool();
  await testMultipleToolCalls();
  await testComplexWorkflow();
  await testErrorHandling();
}

declare const process: {
  stdout: {
    write(value: string): void;
  };
};

await main();

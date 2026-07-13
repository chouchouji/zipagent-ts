import { Agent, Runner, StreamEventType, functionTool } from "../src/index.ts";
import { DemoModel, delay, lastUserMessage, latestToolMessage, textResponse, toolResponse } from "./mock-model.ts";
import type { StreamEvent } from "../src/index.ts";

const calculate = functionTool(
  async (expression: string) => {
    await delay(100);
    try {
      return String(Function(`"use strict"; return (${expression})`)());
    } catch (error) {
      return `计算错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "calculate",
    description: "计算数学表达式",
    parameters: {
      expression: { type: "string" },
    },
  },
);

const searchInfo = functionTool(
  (query: string) => {
    const knowledgeBase: Record<string, string> = {
      python: "Python 是一种高级编程语言，常用于脚本、数据分析和 AI 应用。",
      ai: "人工智能致力于让系统完成通常需要人类智能的任务。",
      "机器学习": "机器学习让计算机从数据中学习模式并持续改进。",
      "深度学习": "深度学习使用多层神经网络处理复杂模式。",
    };

    const match = Object.entries(knowledgeBase).find(([key]) => query.toLowerCase().includes(key.toLowerCase()));
    return match?.[1] ?? `未找到关于 ${query} 的相关信息`;
  },
  {
    name: "search_info",
    description: "搜索信息",
    parameters: {
      query: { type: "string" },
    },
  },
);

const getCurrentTime = functionTool(
  () => new Date().toLocaleString("zh-CN", { hour12: false }),
  {
    name: "get_current_time",
    description: "获取当前时间",
  },
);

function createSimpleAgent(): Agent {
  return new Agent({
    name: "ChatBot",
    instructions: "你是一个友好的聊天机器人，请用自然流畅的语言回答问题。",
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      return textResponse(`这是关于「${question}」的流式示例回答。`);
    }),
    useSystemPrompt: false,
  });
}

function createToolAgent(): Agent {
  return new Agent({
    name: "Assistant",
    instructions: "你是一个智能助手。需要工具时先说明原因，再调用工具，最后给出完整答案。",
    tools: [calculate, searchInfo, getCurrentTime],
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      const latestTool = latestToolMessage(messages);
      if (latestTool) {
        return textResponse(`已根据工具结果完成回答：${latestTool.content ?? ""}`);
      }
      if (question.includes("几点") || question.includes("时间")) {
        return toolResponse("我需要先获取当前时间。", "get_current_time", {});
      }
      if (question.includes("计算")) {
        return toolResponse("我需要调用计算工具。", "calculate", { expression: "12 * 8" });
      }
      return toolResponse("我需要搜索知识库。", "search_info", { query: question });
    }),
    useSystemPrompt: false,
  });
}

async function demoBasicStream(): Promise<void> {
  console.log("=".repeat(60));
  console.log("演示1: 基础段落级流式输出");
  console.log("=".repeat(60));

  for await (const event of Runner.runStream(createSimpleAgent(), "请介绍一下 TypeScript 的特点")) {
    if (event.type === StreamEventType.Question) {
      console.log(`问题: ${event.content}`);
    }
    if (event.type === StreamEventType.Answer) {
      console.log(`回答: ${event.content}`);
    }
  }
}

async function demoCharStream(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示2: 逐字符流式输出");
  console.log("=".repeat(60));

  process.stdout.write("回答: ");
  for await (const event of Runner.runStream(createSimpleAgent(), "什么是人工智能？")) {
    if (event.type === StreamEventType.AnswerDelta) {
      process.stdout.write(event.content ?? "");
      await delay(5);
    }
    if (event.type === StreamEventType.Answer) {
      console.log(`\n完成，总字符数: ${event.content?.length ?? 0}`);
    }
  }
}

async function demoCallbackStream(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示3: 回调式流式处理");
  console.log("=".repeat(60));

  let charCount = 0;
  const startedAt = Date.now();
  await Runner.run(createSimpleAgent(), "请解释机器学习的基本概念", {
    streamCallback: (event: StreamEvent) => {
      if (event.type === StreamEventType.AnswerDelta) {
        charCount += event.content?.length ?? 0;
      }
      if (event.type === StreamEventType.Answer) {
        console.log(`统计: ${charCount} 字符，耗时 ${Date.now() - startedAt}ms`);
      }
    },
  });
}

async function demoToolWithStream(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示4: 工具调用 + 流式输出");
  console.log("=".repeat(60));

  for await (const event of Runner.runStream(createToolAgent(), "现在几点了？然后帮我计算 12 * 8")) {
    if (event.type === StreamEventType.ToolCall) {
      console.log(`调用工具: ${event.toolName}(${JSON.stringify(event.toolArgs)})`);
    }
    if (event.type === StreamEventType.ToolResult) {
      console.log(`工具结果: ${event.toolResult}`);
    }
    if (event.type === StreamEventType.Answer) {
      console.log(`最终回答: ${event.content}`);
    }
  }
}

async function demoPerformanceComparison(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示5: 流式方式性能统计");
  console.log("=".repeat(60));

  const start = Date.now();
  let charCount = 0;
  for await (const event of Runner.runStream(createSimpleAgent(), "请详细介绍深度学习的发展历程")) {
    if (event.type === StreamEventType.AnswerDelta) {
      charCount += event.content?.length ?? 0;
    }
  }
  console.log(`逐字符事件统计: ${charCount} 字符，耗时 ${Date.now() - start}ms`);
}

async function main(): Promise<void> {
  await demoBasicStream();
  await demoCharStream();
  await demoCallbackStream();
  await demoToolWithStream();
  await demoPerformanceComparison();
}

declare const process: {
  stdout: {
    write(value: string): void;
  };
};

await main();

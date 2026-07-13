import { Agent, Context, Runner, functionTool } from "../src/index.ts";
import { DemoModel, lastUserMessage, latestToolMessage, textResponse, toolResponse } from "./mock-model.ts";

const calculate = functionTool(
  (expression: string) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      return `计算结果: ${result}`;
    } catch (error) {
      return `计算错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "calculate",
    description: "计算数学表达式",
    parameters: {
      expression: { type: "string", description: "数学表达式，如 2 + 2" },
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

const saveNote = functionTool(
  (content: string) => `笔记已保存 [${new Date().toLocaleString("zh-CN", { hour12: false })}]: ${content}`,
  {
    name: "save_note",
    description: "保存笔记",
    parameters: {
      content: { type: "string", description: "要保存的笔记内容" },
    },
  },
);

function createDemoAgent(tools = [calculate]) {
  return new Agent({
    name: "Assistant",
    instructions: "你是一个可以计算、记笔记、查时间的助手。",
    tools,
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      const latestTool = latestToolMessage(messages);
      if (latestTool?.name === "calculate") {
        return textResponse(`工具返回：${latestTool.content ?? ""}`);
      }
      if (latestTool?.name === "get_current_time") {
        return textResponse("我已经获取到当前时间，并可以继续帮你记录。");
      }
      if (latestTool?.name === "save_note") {
        return textResponse(`笔记处理完成：${latestTool.content ?? ""}`);
      }
      if (question.includes("几点") || question.includes("时间")) {
        return toolResponse("我需要先获取当前时间。", "get_current_time", {});
      }
      if (question.includes("记录")) {
        return toolResponse("我会把内容保存为笔记。", "save_note", { content: question });
      }
      return toolResponse("我需要调用计算工具。", "calculate", { expression: "23 + 45" });
    }),
    useSystemPrompt: false,
  });
}

async function demoBasicUsage(): Promise<void> {
  console.log("=".repeat(50));
  console.log("演示1: 基础 Agent 用法");
  console.log("=".repeat(50));

  const agent = createDemoAgent([calculate]);
  console.log("Agent 创建成功");
  console.log(`工具数量: ${agent.getAllTools().length}`);

  const result = await Runner.run(agent, "请计算 23 + 45");
  console.log(`结果: ${result.content}`);
}

async function demoContextManagement(): Promise<void> {
  console.log("\n" + "=".repeat(50));
  console.log("演示2: Context 管理和多轮对话");
  console.log("=".repeat(50));

  const agent = createDemoAgent([calculate, saveNote, getCurrentTime]);
  const context = new Context();

  const result1 = await Runner.run(agent, "现在几点了？", { context });
  console.log(`第1轮: ${result1.content}`);

  const result2 = await Runner.run(agent, "帮我记录一下刚才的时间", { context });
  console.log(`第2轮: ${result2.content}`);

  const result3 = await Runner.run(agent, "计算一下 12 * 8", { context });
  console.log(`第3轮: ${result3.content}`);

  console.log("\nContext 状态:");
  console.log(`- 消息数量: ${context.messages.length}`);
  console.log(`- 对话轮数: ${context.turnCount}`);
  console.log(`- Token 使用: ${context.usage.totalTokens}`);
}

async function demoContextFeatures(): Promise<void> {
  console.log("\n" + "=".repeat(50));
  console.log("演示3: Context 高级功能");
  console.log("=".repeat(50));

  const context = new Context();
  context.setData("user_name", "张三");
  context.setData("session_id", "session_001");

  console.log(`用户名: ${context.getData("user_name")}`);
  console.log(`会话ID: ${context.getData("session_id")}`);

  const cloned = context.clone();
  console.log(`克隆会话ID保持一致: ${cloned.contextId === context.contextId}`);
}

async function demoErrorHandling(): Promise<void> {
  console.log("\n" + "=".repeat(50));
  console.log("演示4: 异常处理");
  console.log("=".repeat(50));

  const divide = functionTool(
    (a: number, b: number) => {
      if (b === 0) {
        throw new Error("除数不能为零");
      }
      return `${a} / ${b} = ${a / b}`;
    },
    {
      name: "divide",
      description: "除法运算",
      parameters: {
        a: { type: "number" },
        b: { type: "number" },
      },
    },
  );

  const result = await divide.execute({ a: 10, b: 0 });
  console.log(result.success ? result.result : `捕获工具错误: ${result.error}`);
}

async function main(): Promise<void> {
  await demoBasicUsage();
  await demoContextManagement();
  await demoContextFeatures();
  await demoErrorHandling();

  console.log("\n所有基础演示完成。");
}

await main();

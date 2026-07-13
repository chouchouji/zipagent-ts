# zipagent-ts

感谢 [ZipAgent](https://github.com/JiayuXu0/ZipAgent) 项目提供的设计和实现参考。本项目是 ZipAgent 核心能力的 TypeScript 翻译版。

`zipagent-ts` 是一个轻量级 TypeScript Agent 运行时，保留了 ZipAgent 的主要模块划分和使用方式：

- `Agent`：描述助手名称、系统指令、模型和可用工具。
- `Runner`：驱动模型调用、工具调用和多轮执行循环。
- `Context`：保存对话历史、元数据和 token 使用统计。
- `Tool` / `functionTool`：把 TypeScript 函数暴露为模型可调用工具。
- `OpenAIModel`：通过 `fetch` 调用 OpenAI-compatible Chat Completions API。
- `StreamEvent`：提供结构化流式事件，方便接入 CLI 或 Web UI。

## 安装依赖

当前项目没有运行时依赖，TypeScript 和 Vitest 只用于开发、类型检查和测试。

```bash
pnpm install
```

## 测试

```bash
pnpm test
pnpm typecheck
```

## 构建

项目使用 `tsup` 构建 npm 发布产物，输出目录为 `dist/`，同时生成 ESM、CJS 和类型声明文件。

```bash
pnpm build
```

## 基础用法

```ts
import { Agent, Runner, functionTool } from "zipagent-ts";

const calculate = functionTool(
  (expression: string) => String(Function(`"use strict"; return (${expression})`)()),
  {
    name: "calculate",
    description: "计算数学表达式。",
    parameters: {
      expression: { type: "string", description: "要计算的表达式。" },
    },
  },
);

const agent = new Agent({
  name: "MathAssistant",
  instructions: "你是一个数学助手。",
  tools: [calculate],
});

const result = await Runner.run(agent, "计算 23 + 45");
console.log(result.content);
```

## 项目状态

这个仓库目前实现了 ZipAgent 的核心闭环：Agent 定义、工具系统、上下文管理、流式事件、OpenAI-compatible 模型封装和基础 MCP transport 包装。后续可以继续补充 npm 发布构建、完整 MCP stdio 适配器和更多示例。

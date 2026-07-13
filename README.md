# zipagent-ts

感谢 [ZipAgent](https://github.com/JiayuXu0/ZipAgent) 项目提供的设计和实现参考。本项目是 ZipAgent 核心能力的 TypeScript 翻译版。

`zipagent-ts` 是一个轻量级 TypeScript AI Agent 运行时，专注于简洁、高效和易扩展。它保留了 ZipAgent 的主要模块划分：Agent 引擎、工具系统、上下文管理、流式事件和 MCP 扩展接口。

## 应用场景

| 场景 | 能力 |
| --- | --- |
| 智能客服 | 自动回答常见问题、处理订单查询 |
| 代码助手 | 代码 review、代码生成、bug 修复建议 |
| 数据分析 | 自动生成报表、发现数据洞察 |
| 内容生成 | 写作助手、营销文案生成 |
| 工作流自动化 | 任务调度执行、流程自动化 |
| 知识问答 | 企业知识库、智能问答系统 |

## 核心特性

- **简洁 API**：几行代码即可创建一个可运行的 Agent。
- **工具系统**：通过 `functionTool` 把 TypeScript 函数暴露为模型可调用工具。
- **流式输出**：使用 `Runner.runStream()` 获取实时事件，适合 CLI、Web UI 和聊天界面。
- **上下文管理**：`Context` 自动保存对话历史、token 使用统计和自定义数据。
- **MCP 扩展**：通过 `MCPTool.fromTransport()` 把 MCP SDK adapter 暴露为统一工具。
- **OpenAI-compatible 模型**：`OpenAIModel` 使用 `fetch` 调用 Chat Completions 兼容接口。
- **TypeScript 优先**：内置类型声明，支持 ESM/CJS 构建产物。

## 安装

```bash
pnpm install
```

## 快速开始

```ts
import { Agent, Runner, functionTool } from "zipagent-ts";

const calculate = functionTool(
  (expression: string) => String(Function(`"use strict"; return (${expression})`)()),
  {
    name: "calculate",
    description: "计算数学表达式",
    parameters: {
      expression: { type: "string", description: "要计算的表达式" },
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

## 功能展示

### 流式输出

```ts
import { Runner, StreamEventType } from "zipagent-ts";

for await (const event of Runner.runStream(agent, "解释什么是人工智能")) {
  if (event.type === StreamEventType.AnswerDelta) {
    process.stdout.write(event.content ?? "");
  }
  if (event.type === StreamEventType.ToolCall) {
    console.log(`调用工具: ${event.toolName}`);
  }
}
```

### 上下文管理

```ts
import { Context, Runner } from "zipagent-ts";

const context = new Context();

const result1 = await Runner.run(agent, "我叫小明", { context });
const result2 = await Runner.run(agent, "我叫什么名字？", { context });

console.log(result1.content);
console.log(result2.content);
console.log(`对话轮数: ${context.turnCount}`);
console.log(`Token 使用: ${context.usage.totalTokens}`);
```

### MCP 工具集成

```ts
import { Agent, MCPTool, Runner } from "zipagent-ts";
import type { MCPTransport } from "zipagent-ts";

const transport: MCPTransport = {
  async listTools() {
    return [
      {
        name: "maps_weather",
        description: "查询城市天气",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string", description: "城市名称" },
          },
          required: ["city"],
        },
      },
    ];
  },
  async callTool(name, args) {
    return `${args.city} 今天多云，温度 24°C`;
  },
};

const mapTools = await MCPTool.fromTransport("map", transport);

const agent = new Agent({
  name: "MapAssistant",
  instructions: "你是一个地图助手。",
  tools: [mapTools],
});

const result = await Runner.run(agent, "北京今天天气怎么样？");
console.log(result.content);
```

### 异常处理

```ts
const divide = functionTool(
  (a: number, b: number) => {
    if (b === 0) {
      throw new Error("除数不能为零");
    }
    return a / b;
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

const toolResult = await divide.execute({ a: 10, b: 0 });
if (!toolResult.success) {
  console.log(`工具执行失败: ${toolResult.error}`);
}
```

### 自定义模型

```ts
import { Agent, OpenAIModel } from "zipagent-ts";

const model = new OpenAIModel({
  model: "gpt-4o-mini",
  apiKey: "your_api_key",
  baseUrl: "https://api.openai.com/v1",
});

const agent = new Agent({
  name: "CustomAgent",
  instructions: "你是一个助手。",
  model,
  tools: [calculate],
});
```

## 完整示例

查看 `examples/` 目录获取更多示例：

- [`basic_demo.ts`](examples/basic_demo.ts)：基础功能、工具定义、上下文管理、异常处理。
- [`stream_demo.ts`](examples/stream_demo.ts)：段落级流式、逐字符流式、回调式流式、工具调用流式。
- [`mcp_demo.ts`](examples/mcp_demo.ts)：MCP transport 包装、本地工具和 MCP 工具混用、系统提示演示。
- [`streaming_tool_calling_demo.ts`](examples/streaming_tool_calling_demo.ts)：复杂流式工具调用、多工具协作、上下文工作流。
- [`quick_streaming_test.ts`](examples/quick_streaming_test.ts)：快速验证流式工具调用和 TTFB 统计。

```bash
node --experimental-transform-types examples/basic_demo.ts
node --experimental-transform-types examples/stream_demo.ts
node --experimental-transform-types examples/mcp_demo.ts
node --experimental-transform-types examples/streaming_tool_calling_demo.ts
node --experimental-transform-types examples/quick_streaming_test.ts
```

示例默认使用本地 `DemoModel`，可以在没有真实 API key 的情况下运行。需要真实模型时，把示例中的 `DemoModel` 替换为 `OpenAIModel` 即可。

## 项目架构

```text
zipagent-ts/
├── src/
│   ├── agent.ts        # Agent 核心类
│   ├── context.ts      # 上下文管理
│   ├── model.ts        # LLM 模型抽象和 OpenAI-compatible 实现
│   ├── runner.ts       # 执行引擎
│   ├── tool.ts         # 工具系统
│   ├── stream.ts       # 流式事件
│   ├── mcp-tool.ts     # MCP 工具包装
│   ├── exceptions.ts   # 异常类型
│   └── index.ts        # 包入口
├── examples/           # 使用示例
├── test/               # Vitest 测试
└── tsup.config.ts      # 构建配置
```

## 开发

### 测试

```bash
pnpm test
pnpm typecheck
```

### 构建

项目使用 `tsup` 构建 npm 发布产物，输出目录为 `dist/`，同时生成 ESM、CJS 和类型声明文件。

```bash
pnpm build
pnpm pack --dry-run
```

## 贡献

欢迎提交 issue、示例、文档改进和功能 PR。这个项目目前优先补齐：

1. npm 发布工作流。
2. 完整 MCP stdio adapter。
3. 更多真实 OpenAI-compatible 服务示例。
4. Web UI 和 CLI 集成示例。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。

## 致谢

- [ZipAgent](https://github.com/JiayuXu0/ZipAgent)：原始 Python 项目和 API 设计参考。
- OpenAI：提供 Chat Completions 风格的模型接口。
- MCP 社区：提供 Model Context Protocol 标准。
- TypeScript 和 Node.js 生态：提供类型系统、运行时和构建工具。

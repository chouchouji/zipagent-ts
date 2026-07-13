import { Agent, MCPTool, Runner, StreamEventType, functionTool } from "../src/index.ts";
import type { MCPToolInfo, MCPTransport } from "../src/index.ts";
import { DemoModel, lastUserMessage, latestToolMessage, textResponse, toolResponse } from "./mock-model.ts";

declare const process: {
  env?: Record<string, string | undefined>;
};

const calculate = functionTool(
  (expression: string) => {
    try {
      return `计算结果: ${Function(`"use strict"; return (${expression})`)()}`;
    } catch (error) {
      return `计算错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "calculate",
    description: "计算数学表达式",
    parameters: {
      expression: { type: "string", description: "要计算的数学表达式" },
    },
  },
);

const calculateDistance = functionTool(
  (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const latDiff = Math.abs(lat1 - lat2);
    const lngDiff = Math.abs(lng1 - lng2);
    const distance = Math.sqrt(latDiff ** 2 + lngDiff ** 2) * 111;
    return `直线距离约 ${distance.toFixed(2)} 公里`;
  },
  {
    name: "calculate_distance",
    description: "计算两点间的直线距离",
    parameters: {
      lat1: { type: "number", description: "起点纬度" },
      lng1: { type: "number", description: "起点经度" },
      lat2: { type: "number", description: "终点纬度" },
      lng2: { type: "number", description: "终点经度" },
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

class MockMapTransport implements MCPTransport {
  async listTools(): Promise<MCPToolInfo[]> {
    return [
      {
        name: "maps_weather",
        description: "查询城市天气",
        inputSchema: {
          type: "object" as const,
          properties: {
            city: { type: "string" as const, description: "城市名称" },
          },
          required: ["city"],
        },
      },
      {
        name: "maps_geo",
        description: "查询地点坐标",
        inputSchema: {
          type: "object" as const,
          properties: {
            address: { type: "string" as const, description: "地点名称" },
          },
          required: ["address"],
        },
      },
    ];
  }

  async callTool(name: string, arguments_: Record<string, unknown>) {
    if (name === "maps_weather") {
      return `${arguments_.city} 今天多云，温度 24°C`;
    }
    if (name === "maps_geo") {
      return `${arguments_.address} 的模拟坐标为 39.9163,116.3972`;
    }
    return `未知 MCP 工具: ${name}`;
  }
}

async function demoMcpIntegration(): Promise<void> {
  console.log("=".repeat(60));
  console.log("演示1: MCP 工具集成");
  console.log("=".repeat(60));

  const mapTools = await MCPTool.fromTransport("mock-map", new MockMapTransport());
  console.log(`MCP 工具加载成功: ${mapTools.getToolNames().join(", ")}`);

  const agent = new Agent({
    name: "MapAssistant",
    instructions: "你是一个地图助手，可以混合使用本地工具和 MCP 工具。",
    tools: [calculateDistance, mapTools, calculate, getCurrentTime],
    model: new DemoModel((messages) => {
      const question = lastUserMessage(messages);
      const latestTool = latestToolMessage(messages);
      if (latestTool?.name === "maps_weather" || latestTool?.name === "maps_geo") {
        return textResponse(`已根据 MCP 工具结果完成回答：${latestTool.content ?? ""}`);
      }
      if (question.includes("天气")) {
        return toolResponse("需要调用 MCP 天气工具。", "maps_weather", { city: "北京" });
      }
      return toolResponse("需要查询地点坐标。", "maps_geo", { address: "北京故宫" });
    }),
    useSystemPrompt: true,
  });

  for await (const event of Runner.runStream(agent, "北京今天天气怎么样？")) {
    if (event.type === StreamEventType.ToolCall) {
      console.log(`调用工具: ${event.toolName}(${JSON.stringify(event.toolArgs)})`);
    }
    if (event.type === StreamEventType.ToolResult) {
      console.log(`工具结果: ${event.toolResult}`);
    }
    if (event.type === StreamEventType.Answer) {
      console.log(`回答: ${event.content}`);
    }
  }
}

async function demoSystemPromptIntegration(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示2: 系统提示功能");
  console.log("=".repeat(60));

  const agentDefault = new Agent({
    name: "标准助手",
    instructions: "你是一个数学助手",
    tools: [calculate],
    model: new DemoModel(() => textResponse("ok")),
    useSystemPrompt: true,
  });

  const agentMinimal = new Agent({
    name: "简洁助手",
    instructions: "你是一个数学助手",
    tools: [calculate],
    model: new DemoModel(() => textResponse("ok")),
    useSystemPrompt: false,
  });

  console.log(`默认系统提示长度: ${(agentDefault.getSystemMessage().content ?? "").length}`);
  console.log(`简洁系统提示长度: ${(agentMinimal.getSystemMessage().content ?? "").length}`);
}

async function demoRealMcpShape(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("演示3: 真实 MCP 接入形态");
  console.log("=".repeat(60));

  const apiKey = process.env?.AMAP_MAPS_API_KEY;
  console.log(apiKey ? "检测到 AMAP_MAPS_API_KEY，可接入真实 MCP transport。" : "未设置 AMAP_MAPS_API_KEY，本示例使用 Mock transport。");
  console.log("zipagent-ts 当前提供 MCPTool.fromTransport()，真实 stdio 连接可由 MCP SDK adapter 注入。");
}

async function main(): Promise<void> {
  await demoMcpIntegration();
  await demoSystemPromptIntegration();
  await demoRealMcpShape();
}

await main();

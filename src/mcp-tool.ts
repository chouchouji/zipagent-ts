import { Tool, ToolResult } from "./tool.ts";
import type { ToolSchema } from "./tool.ts";

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: ToolSchema["function"]["parameters"];
}

export interface MCPTransport {
  listTools(): Promise<MCPToolInfo[]>;
  callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown>;
  close?(): Promise<void>;
}

export class MCPTool extends Tool {
  transport: MCPTransport;
  mcpSchema: MCPToolInfo;

  constructor(info: MCPToolInfo, transport: MCPTransport) {
    super(
      info.name,
      info.description ?? `MCP tool ${info.name}`,
      async (arguments_: Record<string, unknown>) => transport.callTool(info.name, arguments_),
      {
        invoke: "object",
        parameters: info.inputSchema?.properties ?? {},
        required: info.inputSchema?.required ?? [],
      },
    );
    this.transport = transport;
    this.mcpSchema = info;
  }

  override async execute(arguments_: Record<string, unknown>): Promise<ToolResult> {
    return super.execute(arguments_);
  }

  static async fromTransport(
    name: string,
    transport: MCPTransport,
    selectedTools: string[] | null = null,
  ): Promise<MCPToolGroup> {
    const toolSet = selectedTools ? new Set(selectedTools) : null;
    const tools = (await transport.listTools())
      .filter((tool) => !toolSet || toolSet.has(tool.name))
      .map((tool) => new MCPTool(tool, transport));

    return new MCPToolGroup(name, tools, transport);
  }

  static async connect(): Promise<MCPToolGroup> {
    throw new Error(
      "MCP stdio connection is not bundled in zipagent-ts yet. Use MCPTool.fromTransport() with an MCP SDK adapter.",
    );
  }
}

export class MCPToolGroup implements Iterable<MCPTool> {
  name: string;
  tools: MCPTool[];
  transport: MCPTransport;
  private toolsByName: Map<string, MCPTool>;

  constructor(name: string, tools: MCPTool[], transport: MCPTransport) {
    this.name = name;
    this.tools = tools;
    this.transport = transport;
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  }

  [Symbol.iterator](): Iterator<MCPTool> {
    return this.tools[Symbol.iterator]();
  }

  get length(): number {
    return this.tools.length;
  }

  at(index: number): MCPTool | undefined {
    return this.tools[index];
  }

  get(name: string): MCPTool | undefined {
    return this.toolsByName.get(name);
  }

  findTool(name: string): MCPTool | null {
    return this.get(name) ?? null;
  }

  getToolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  async close(): Promise<void> {
    await this.transport.close?.();
  }
}

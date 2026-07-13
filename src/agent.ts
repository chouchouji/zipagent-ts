import { Model, OpenAIModel } from "./model.ts";
import { Tool } from "./tool.ts";
import type { Message } from "./context.ts";
import type { ToolSchema } from "./tool.ts";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a helpful AI agent.",
  "When tools are available, call the appropriate tool instead of guessing.",
  "After a tool result is returned, use it to produce a concise final answer.",
].join("\n");

export interface ToolGroup extends Iterable<Tool> {
  tools?: Tool[];
}

export interface AgentOptions {
  name: string;
  instructions: string;
  model?: Model | null;
  tools?: Array<Tool | ToolGroup>;
  useSystemPrompt?: boolean;
  systemPrompt?: string | null;
}

function isToolGroup(item: Tool | ToolGroup): item is ToolGroup {
  return typeof (item as ToolGroup)[Symbol.iterator] === "function" && !(item instanceof Tool);
}

export class Agent {
  name: string;
  instructions: string;
  model: Model;
  tools: Array<Tool | ToolGroup>;
  useSystemPrompt: boolean;
  systemPrompt: string | null;

  constructor(options: AgentOptions) {
    this.name = options.name;
    this.instructions = options.instructions;
    this.model = options.model ?? new OpenAIModel();
    this.tools = options.tools ?? [];
    this.useSystemPrompt = options.useSystemPrompt ?? true;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  getSystemMessage(): Message {
    let systemContent = this.instructions;

    if (this.useSystemPrompt && this.systemPrompt) {
      systemContent = `${this.systemPrompt}\n\n${systemContent}`;
    }

    const allTools = this.getAllTools();
    if (allTools.length) {
      const toolNames = allTools.map((tool) => tool.name).join(", ");
      systemContent += `\n\nYou can use these tools: ${toolNames}.`;
      systemContent += "\nCall a tool when it is needed to answer accurately.";
    }

    return { role: "system", content: systemContent };
  }

  getToolsSchema(): ToolSchema[] {
    return this.getAllTools().map((tool) => tool.toDict());
  }

  findTool(name: string): Tool | null {
    return this.getAllTools().find((tool) => tool.name === name) ?? null;
  }

  addTool(tool: Tool | ToolGroup): void {
    this.tools.push(tool);
  }

  removeTool(name: string): boolean {
    for (let index = 0; index < this.tools.length; index += 1) {
      const item = this.tools[index];

      if (item instanceof Tool && item.name === name) {
        this.tools.splice(index, 1);
        return true;
      }

      if (isToolGroup(item)) {
        const groupTools = item.tools ?? Array.from(item);
        const toolIndex = groupTools.findIndex((tool) => tool.name === name);
        if (toolIndex >= 0) {
          groupTools.splice(toolIndex, 1);
          if (groupTools.length === 0) {
            this.tools.splice(index, 1);
          }
          return true;
        }
      }
    }

    return false;
  }

  getAllTools(): Tool[] {
    const allTools: Tool[] = [];
    for (const item of this.tools) {
      if (isToolGroup(item)) {
        allTools.push(...Array.from(item));
      } else {
        allTools.push(item);
      }
    }
    return allTools;
  }

  toString(): string {
    return `Agent(name=${this.name}, tools=${this.getAllTools().length})`;
  }
}

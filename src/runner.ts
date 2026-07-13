import { Agent } from "./agent.ts";
import { Context } from "./context.ts";
import { StreamEvent, StreamEventType } from "./stream.ts";
import type { ModelResponse, StreamDelta } from "./model.ts";

export class RunResult {
  content: string;
  context: Context;
  success: boolean;
  error: string | null;

  constructor(content: string, context: Context, success = true, error: string | null = null) {
    this.content = content;
    this.context = context;
    this.success = success;
    this.error = error;
  }

  toString(): string {
    return this.content;
  }
}

export interface RunOptions {
  context?: Context | null;
  maxTurns?: number;
  streamCallback?: (event: StreamEvent) => void | Promise<void>;
}

function isModelResponse(item: StreamDelta | ModelResponse): item is ModelResponse {
  return (
    "usage" in item &&
    "finishReason" in item &&
    "toolCalls" in item
  );
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export class Runner {
  static async run(agent: Agent, userInput: string, options: RunOptions = {}): Promise<RunResult> {
    const context = options.context ?? new Context();
    let finalContent = "";
    let finalError: string | null = null;

    try {
      for await (const event of Runner.runStream(agent, userInput, {
        context,
        maxTurns: options.maxTurns,
      })) {
        await options.streamCallback?.(event);
        if (event.type === StreamEventType.Answer && event.content !== null) {
          finalContent = event.content;
        }
        if (event.type === StreamEventType.Error) {
          finalError = event.error;
        }
      }

      return new RunResult(finalContent, context, finalError === null, finalError);
    } catch (error) {
      const message = `Run failed: ${error instanceof Error ? error.message : String(error)}`;
      return new RunResult("", context, false, message);
    }
  }

  static async *runStream(
    agent: Agent,
    userInput: string,
    options: Omit<RunOptions, "streamCallback"> = {},
  ): AsyncGenerator<StreamEvent, RunResult, void> {
    const context = options.context ?? new Context();
    const maxTurns = options.maxTurns ?? 10;
    context.lastAgent = agent.name;

    try {
      if (context.messages.length === 0) {
        const systemMessage = agent.getSystemMessage();
        context.addMessage(systemMessage.role, systemMessage.content ?? null);
      }

      context.addMessage("user", userInput);
      context.turnCount += 1;
      yield StreamEvent.question(userInput);

      const toolsSchema = agent.getAllTools().length ? agent.getToolsSchema() : null;

      for (let turn = 0; turn < maxTurns; turn += 1) {
        const stream = agent.model.generateStream(context.getMessagesForApi(), toolsSchema);
        let fullContent = "";
        let response: ModelResponse | null = null;

        for await (const streamItem of stream) {
          if (isModelResponse(streamItem)) {
            response = streamItem;
            break;
          }

          if (streamItem.content) {
            fullContent += streamItem.content;
            yield StreamEvent.answerDelta(streamItem.content);
          }
        }

        if (response) {
          context.usage.add(response.usage);

          if (response.toolCalls?.length) {
            yield StreamEvent.thinking(fullContent);
            context.addMessage("assistant", fullContent);
          } else {
            const answer = response.content ?? fullContent;
            yield StreamEvent.answer(answer);
            context.addMessage("assistant", answer);
            return new RunResult(answer, context);
          }
        }

        if (response?.toolCalls?.length) {
          let hasToolResults = false;

          for (const toolCall of response.toolCalls) {
            const toolName = toolCall.function.name;
            let arguments_: Record<string, unknown>;

            try {
              arguments_ = parseArguments(toolCall.function.arguments);
            } catch {
              arguments_ = {};
            }

            const tool = agent.findTool(toolName);
            if (!tool) {
              const errorMessage = `Tool not found: ${toolName}`;
              yield StreamEvent.createError(errorMessage);
              context.addMessage("system", errorMessage);
              continue;
            }

            yield StreamEvent.toolCall(toolName, arguments_);
            const toolResult = await tool.execute(arguments_);

            if (toolResult.success) {
              yield StreamEvent.createToolResult(toolName, toolResult.result);
              context.addToolCall(toolName, arguments_, toolResult.result);
              hasToolResults = true;
            } else {
              const errorMessage = `Tool ${toolName} failed: ${toolResult.error}`;
              yield StreamEvent.createError(errorMessage);
              context.addMessage("system", errorMessage);
            }
          }

          if (hasToolResults) {
            continue;
          }
        }

        const errorMessage = "Model returned no content";
        yield StreamEvent.createError(errorMessage);
        return new RunResult("", context, false, errorMessage);
      }

      const errorMessage = `Reached max turns (${maxTurns}); possible infinite loop`;
      yield StreamEvent.createError(errorMessage);
      return new RunResult("", context, false, errorMessage);
    } catch (error) {
      const message = `Run failed: ${error instanceof Error ? error.message : String(error)}`;
      yield StreamEvent.createError(message);
      return new RunResult("", context, false, message);
    }
  }
}

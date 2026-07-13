export class ZipAgentError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ModelError extends ZipAgentError {}
export class ToolError extends ZipAgentError {}
export class ToolNotFoundError extends ToolError {}
export class ToolExecutionError extends ToolError {}
export class ContextError extends ZipAgentError {}
export class TokenLimitError extends ZipAgentError {}
export class MaxTurnsError extends ZipAgentError {}
export class ResponseParseError extends ZipAgentError {}
export class ConfigurationError extends ZipAgentError {}
export class StreamError extends ZipAgentError {}


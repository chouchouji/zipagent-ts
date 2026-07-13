export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array";

export interface ParameterSchema {
  type: JsonSchemaType;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, ParameterSchema>;
  items?: ParameterSchema;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ParameterSchema>;
      required: string[];
    };
  };
}

export class ToolResult {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error: string | null;

  constructor(options: {
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    success?: boolean;
    error?: string | null;
  }) {
    this.name = options.name;
    this.arguments = options.arguments;
    this.result = options.result;
    this.success = options.success ?? true;
    this.error = options.error ?? null;
  }
}

export type ToolFunction<TResult = unknown> = (...args: any[]) => TResult | Promise<TResult>;

export interface FunctionToolOptions {
  name?: string;
  description?: string;
  parameters?: Record<string, ParameterSchema>;
  required?: string[];
  invoke?: "object" | "positional";
}

function extractFunctionName(fn: Function): string {
  return fn.name || "anonymous_tool";
}

function stripDefaultValue(param: string): string {
  return param.split("=")[0]?.trim() ?? param.trim();
}

function extractParameterNames(fn: Function): string[] {
  const source = fn.toString();
  const arrowMatch = source.match(/^(?:async\s*)?(?:\(([^)]*)\)|([^=()\s]+))\s*=>/);
  const classicMatch = source.match(/^[^(]*\(([^)]*)\)/);
  const rawParams = arrowMatch?.[1] ?? arrowMatch?.[2] ?? classicMatch?.[1] ?? "";

  if (!rawParams.trim()) {
    return [];
  }

  return rawParams
    .split(",")
    .map((param) => stripDefaultValue(param.trim()))
    .filter((param) => param && !param.startsWith("{") && !param.startsWith("["));
}

function inferRequired(fn: Function, names: string[]): string[] {
  const source = fn.toString();
  return names.filter((name) => {
    const pattern = new RegExp(`${name}\\s*=`);
    return !pattern.test(source);
  });
}

function makeSchema(
  name: string,
  description: string,
  fn: Function,
  options: FunctionToolOptions,
): ToolSchema {
  const parameterNames = Object.keys(options.parameters ?? {}).length
    ? Object.keys(options.parameters ?? {})
    : extractParameterNames(fn);

  const properties: Record<string, ParameterSchema> = {};
  for (const parameterName of parameterNames) {
    properties[parameterName] = options.parameters?.[parameterName] ?? {
      type: "string",
      description: `Parameter ${parameterName}`,
    };
  }

  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required: options.required ?? inferRequired(fn, parameterNames),
      },
    },
  };
}

export class Tool<TResult = unknown> {
  name: string;
  description: string;
  fn: ToolFunction<TResult>;
  schema: ToolSchema;
  invoke: "object" | "positional";
  parameterNames: string[];

  constructor(
    name: string,
    description: string,
    fn: ToolFunction<TResult>,
    options: FunctionToolOptions = {},
  ) {
    this.name = name;
    this.description = description;
    this.fn = fn;
    this.schema = makeSchema(name, description, fn, options);
    this.invoke = options.invoke ?? "positional";
    this.parameterNames = Object.keys(this.schema.function.parameters.properties);
  }

  async execute(arguments_: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result =
        this.invoke === "object"
          ? await this.fn(arguments_)
          : await this.fn(...(this.parameterNames.map((name) => arguments_[name]) as any[]));

      return new ToolResult({
        name: this.name,
        arguments: arguments_,
        result,
        success: true,
      });
    } catch (error) {
      return new ToolResult({
        name: this.name,
        arguments: arguments_,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  toDict(): ToolSchema {
    return this.schema;
  }

  toJSON(): ToolSchema {
    return this.schema;
  }
}

export function functionTool<TResult = unknown>(
  fn: ToolFunction<TResult>,
  options: FunctionToolOptions = {},
): Tool<TResult> {
  const name = options.name ?? extractFunctionName(fn);
  const description = options.description ?? `Function ${name}`;
  return new Tool(name, description, fn, options);
}

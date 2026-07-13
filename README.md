# zipagent-ts

`zipagent-ts` is a lightweight TypeScript translation of the core ZipAgent runtime.
It keeps the same main building blocks:

- `Agent` describes the assistant, model, instructions, and tools.
- `Runner` drives the model/tool loop.
- `Context` stores conversation history, metadata, and token usage.
- `Tool` and `functionTool` expose TypeScript functions to the model.
- `OpenAIModel` talks to OpenAI-compatible chat completions APIs through `fetch`.
- `StreamEvent` provides structured streaming events for UI or CLI rendering.

## Install dependencies

This repo currently has no runtime dependencies. TypeScript is only needed for
type checking.

```bash
npm install
```

## Test

```bash
npm test
```

The tests run the `.ts` source directly with Node 22's TypeScript transform.

## Basic usage

```ts
import { Agent, Runner, functionTool } from "zipagent-ts";

const calculate = functionTool(
  (expression: string) => String(Function(`"use strict"; return (${expression})`)()),
  {
    name: "calculate",
    description: "Calculate a math expression.",
    parameters: {
      expression: { type: "string", description: "Expression to evaluate." },
    },
  },
);

const agent = new Agent({
  name: "MathAssistant",
  instructions: "You are a math assistant.",
  tools: [calculate],
});

const result = await Runner.run(agent, "Calculate 23 + 45");
console.log(result.content);
```

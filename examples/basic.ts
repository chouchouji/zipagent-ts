import { Agent, Runner, functionTool } from "../src/index.ts";

const calculate = functionTool(
  (expression: string) => {
    const value = Function(`"use strict"; return (${expression})`)();
    return `Result: ${value}`;
  },
  {
    name: "calculate",
    description: "Calculate a JavaScript math expression.",
    parameters: {
      expression: {
        type: "string",
        description: "Expression such as 23 + 45.",
      },
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


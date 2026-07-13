import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const rootDir = resolve(import.meta.dirname, "..");
const examplesDir = join(rootDir, "examples");
const defaultEnvPath = join(rootDir, ".env");

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.includes("..\\"));
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }

  const key = normalized.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  let value = normalized.slice(equalsIndex + 1).trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'" || quote === "`") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === "\"") {
      value = value
        .replaceAll("\\n", "\n")
        .replaceAll("\\r", "\r")
        .replaceAll("\\t", "\t")
        .replaceAll("\\\"", "\"")
        .replaceAll("\\\\", "\\");
    }
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }

  return [key, value];
}

async function loadEnvFile(filePath = defaultEnvPath): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  let loaded = 0;
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded += 1;
    }
  }

  if (loaded > 0) {
    console.log(`已加载环境配置: ${relative(rootDir, filePath) || ".env"} (${loaded} 项)`);
  }
}

async function listExamples(): Promise<string[]> {
  const entries = await readdir(examplesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".ts") && name !== "mock-model.ts")
    .sort();
}

function normalizeExampleName(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith(".ts") ? basename(trimmed) : `${basename(trimmed)}.ts`;
}

async function promptForExample(examples: string[]): Promise<string> {
  console.log("可运行的示例:");
  for (const [index, name] of examples.entries()) {
    console.log(`  ${index + 1}. ${name}`);
  }

  const rl = createInterface({ input, output });
  try {
    return await rl.question("\n请输入 examples 目录下的文件名: ");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  await loadEnvFile();

  const examples = await listExamples();
  const rawName = process.argv[2] ?? (await promptForExample(examples));
  const fileName = normalizeExampleName(rawName);

  if (!examples.includes(fileName)) {
    console.error(`找不到示例文件: ${fileName}`);
    console.error(`可选文件: ${examples.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const examplePath = normalize(join(examplesDir, fileName));
  if (!isInside(examplesDir, examplePath)) {
    console.error("非法示例路径。");
    process.exitCode = 1;
    return;
  }

  console.log(`\n运行示例: examples/${fileName}\n`);
  const jiti = createJiti(pathToFileURL(rootDir).href, {
    interopDefault: true,
    moduleCache: false,
  });

  await jiti.import(examplePath);
}

await main();

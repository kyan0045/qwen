import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stdin as input } from "node:process";
import { fileURLToPath } from "node:url";
import { Qwen, resolveModelName } from "../client";
import { QwenError } from "../errors";
import { recommend, resolveModel } from "../models";
import type { Message, Usage } from "../types";
import { type CliFlags, parseCliArgs } from "./args";
import { collectStreamText } from "./collect-stream";
import { runConfig } from "./commands/config";
import { runModels } from "./commands/models";
import { runRecommend } from "./commands/recommend";
import { USAGE } from "./help";
import { runRepl } from "./repl";
import { startSpinner } from "./spinner";
import { formatStats } from "./stats";

function version(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function readStdin(): Promise<string> {
  if (input.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
process.stderr.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function resolveChatTarget(flags: CliFlags): { provider?: string; model: string } {
  return {
    provider: flags.provider ?? (flags.local ? "ollama" : undefined),
    model:
      flags.model ??
      recommend({ use: flags.use ?? "chat", local: flags.local, maxParams: flags.maxParams }).id,
  };
}

async function runChat(flags: CliFlags): Promise<number> {
  const target = resolveChatTarget(flags);
  const promptFromArgs = flags.prompt ?? flags.positionals.join(" ").trim();
  const piped = await readStdin();
  const userText = promptFromArgs || piped;

  if (!userText) {
    return runRepl(
      {
        client: new Qwen({ provider: target.provider as never, model: flags.model }),
        model: flags.model,
        system: flags.system,
        thinking: flags.thinking,
      },
      out,
    ).then(() => 0);
  }

  const resolved = resolveModel(target.model);
  const client = new Qwen({
    provider: target.provider as never,
    model: resolved ?? target.model,
  });

  const messages: Message[] = [];
  if (flags.system) messages.push({ role: "system", content: flags.system });
  let content: string = userText;
  if (piped && promptFromArgs) {
    content = `${promptFromArgs}\n\n${piped}`;
  }
  messages.push({ role: "user", content });

  const request = {
    messages,
    model: resolved ?? target.model,
    thinking: flags.thinking,
    thinkingBudget: flags.thinkingBudget,
    enableSearch: flags.enableSearch,
    temperature: flags.temperature,
    maxTokens: flags.maxTokens,
  };

  let answer = "";
  let reasoning = "";

  if (flags.json) {
    const spinner = startSpinner();
    try {
      const response = await client.chat(request);
      out(JSON.stringify(response, null, 2));
      return 0;
    } finally {
      spinner.stop();
    }
  }

  const spinner = startSpinner();
  const started = Date.now();
  let streamed: { answer: string; reasoning: string; usage?: Usage };
  try {
    streamed = await collectStreamText(client.chatStream(request), (text) => {
      spinner.stop();
      if (!flags.quiet) process.stdout.write(text);
    });
  } finally {
    spinner.stop();
  }
  answer = streamed.answer;
  reasoning = streamed.reasoning;
  const sentModel = resolveModelName(request.model, client.config);
  const stats = formatStats(sentModel, streamed.usage, Date.now() - started);

  if (flags.quiet) {
    process.stdout.write(answer);
    if (answer && !answer.endsWith("\n")) process.stdout.write("\n");
  } else {
    if (answer && !answer.endsWith("\n")) process.stdout.write("\n");
    if (reasoning) {
      process.stderr.write(
        `\n[${reasoning.trim().split("\n").length} lines of reasoning hidden (pass --quiet to hide this note)]\n`,
      );
    }
  }
  process.stderr.write(`\n${stats}\n`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  let flags: CliFlags;
  try {
    flags = parseCliArgs(argv);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    err("");
    err(USAGE);
    return 2;
  }

  if (flags.version) {
    out(version());
    return 0;
  }

  const command = flags.positionals[0];

  if (flags.help || command === "help") {
    out(USAGE);
    return 0;
  }

  if (flags.positionals.length === 0 && !flags.prompt) {
    if (flags.json || flags.local || flags.use) {
      if (flags.use || flags.maxParams || flags.top) return runRecommend(flags, out);
      return runModels(flags, out);
    }
  }

  switch (command) {
    case "models":
      return runModels({ ...flags, positionals: flags.positionals.slice(1) }, out);
    case "recommend":
      return runRecommend({ ...flags, positionals: flags.positionals.slice(1) }, out);
    case "config":
      return runConfig(flags, out);
    case "pull": {
      const tag = flags.positionals[1];
      if (!tag) {
        err("usage: qwen pull <tag>   e.g. qwen pull qwen3.8:27b");
        return 2;
      }
      const client = new Qwen({ provider: "ollama" });
      let last = "";
      await client.pullModel(tag, {
        onProgress(p) {
          const label =
            p.total && p.completed !== undefined
              ? `${p.status} ${Math.round((p.completed / p.total) * 100)}%`
              : p.status;
          if (label !== last) {
            last = label;
            process.stderr.write(`\r${label.padEnd(60)}`);
          }
        },
      });
      process.stderr.write("\n");
      out(`pulled ${tag}`);
      return 0;
    }
    default:
      return runChat(flags);
  }
}

const entryPoint = process.argv[1];
if (entryPoint && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof QwenError) {
        err(`${error.name}: ${error.message}`);
        if (error.status) err(`status ${error.status}`);
      } else {
        err(error instanceof Error ? (error.stack ?? error.message) : String(error));
      }
      process.exitCode = 1;
    });
}

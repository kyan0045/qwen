import { fstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stdin as input } from "node:process";
import { fileURLToPath } from "node:url";
import { Qwen, resolveModelName } from "../client";
import { ConfigurationError, QwenError } from "../errors";
import { recommendAll, resolveModel } from "../models";
import {
  type ProviderInput,
  type ResolveEnv,
  defaultModelFor,
  isDashScopeEndpoint,
  isOpenRouterEndpoint,
  resolveProvider,
} from "../providers";
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
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ["..", "../.."]) {
    try {
      const pkg = JSON.parse(readFileSync(join(here, rel, "package.json"), "utf8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === "qwen" && pkg.version) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}

function hasPipedStdin(): boolean {
  if (input.isTTY === true) return false;
  try {
    const stat = fstatSync(0);
    return stat.isFIFO() || (stat.isFile() && stat.size > 0);
  } catch {
    return false;
  }
}

async function readStdin(): Promise<string> {
  if (input.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Sync `stdout.write` wrapper: returns false when the pipe is closed. */
function writeStdout(text: string): boolean {
  try {
    process.stdout.write(text);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EPIPE") return false;
    throw error;
  }
}

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function resolveChatTarget(
  flags: CliFlags,
  env: ResolveEnv = process.env,
): { provider?: string; model: string } {
  const provider = flags.provider ?? (flags.local ? "ollama" : undefined);
  if (flags.model) return { provider, model: flags.model };
  const config = resolveProvider(provider as ProviderInput | undefined, env);
  const isOllama = config.kind === "ollama";
  const isOpenRouter = isOpenRouterEndpoint(config.baseURL);
  const isDashScope =
    config.name.toLowerCase().startsWith("dashscope") || isDashScopeEndpoint(config.baseURL);
  const candidates = recommendAll({
    use: flags.use ?? "chat",
    local: isOllama || flags.local,
    includeCloud: !isOllama,
    maxParams: flags.maxParams,
  });
  const pick = candidates.find((m) => {
    if (isOllama) return Boolean(m.ollamaTag);
    if (isOpenRouter) return Boolean(m.openrouterId);
    if (isDashScope) return Boolean(m.dashscopeId);
    return true;
  });
  if (!pick) {
    throw new ConfigurationError(
      `No Qwen model matches ${JSON.stringify({
        use: flags.use ?? "chat",
        provider: config.name,
        local: isOllama || flags.local || undefined,
        maxParams: flags.maxParams,
      })}. Pass -m/--model explicitly or relax constraints.`,
    );
  }
  return { provider, model: pick.id };
}

async function runChat(flags: CliFlags, preReadStdin?: string): Promise<number> {
  const target = resolveChatTarget(flags);
  if (flags.prompt !== undefined && flags.positionals.length > 0) {
    err("error: --prompt cannot be combined with a positional prompt");
    return 2;
  }
  const promptFromArgs = flags.prompt ?? flags.positionals.join(" ").trim();
  const piped = preReadStdin !== undefined ? preReadStdin.replace(/\r?\n$/, "") : await readStdin();
  const userText = promptFromArgs || piped;

  if (!userText.trim()) {
    return runRepl(
      {
        client: new Qwen({ provider: target.provider as never, model: target.model }),
        model: target.model,
        system: flags.system,
        thinking: flags.thinking,
        thinkingBudget: flags.thinkingBudget,
        reasoningEffort: flags.reasoningEffort,
        preserveThinking: flags.preserveThinking,
        enableSearch: flags.enableSearch,
        temperature: flags.temperature,
        maxTokens: flags.maxTokens,
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
    reasoningEffort: flags.reasoningEffort,
    preserveThinking: flags.preserveThinking,
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
  let pipeOpen = true;
  try {
    streamed = await collectStreamText(client.chatStream(request), (text) => {
      spinner.stop();
      if (!flags.quiet && pipeOpen) pipeOpen = writeStdout(text);
    });
  } finally {
    spinner.stop();
  }
  if (!pipeOpen) return 0;
  answer = streamed.answer;
  reasoning = streamed.reasoning;
  const sentModel = resolveModelName(request.model, client.config, defaultModelFor(client.config));
  const stats = formatStats(sentModel, streamed.usage, Date.now() - started);

  if (flags.quiet) {
    if (!writeStdout(answer)) return 0;
    if (answer && !answer.endsWith("\n")) writeStdout("\n");
  } else {
    if (answer && !answer.endsWith("\n")) writeStdout("\n");
    if (reasoning) {
      process.stderr.write(
        `\n[${reasoning.trim().split("\n").length} lines of reasoning hidden (pass --quiet to hide this note)]\n`,
      );
    }
  }
  process.stderr.write(`\n${stats}\n`);
  return 0;
}

export async function main(argv: string[], opts?: { stdin?: string }): Promise<number> {
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
    if (command !== "help" || flags.positionals.length === 1) {
      out(USAGE);
      return 0;
    }
    const sub = flags.positionals[1];
    if (
      flags.positionals.length === 2 &&
      (sub === "models" || sub === "recommend" || sub === "config" || sub === "pull")
    ) {
      out(`usage: qwen ${sub} ${sub === "pull" ? "<tag>" : "[options]"}   (see qwen --help)`);
      return 0;
    }
    if (flags.positionals.length === 2) {
      err(`unknown help topic "${sub ?? ""}"`);
      err("");
      err(USAGE);
      return 2;
    }
  }

  const hasChatFlags = Boolean(
    flags.model !== undefined ||
      flags.provider !== undefined ||
      flags.system !== undefined ||
      flags.thinking !== undefined ||
      flags.thinkingBudget !== undefined ||
      flags.reasoningEffort !== undefined ||
      flags.preserveThinking ||
      flags.enableSearch ||
      flags.temperature !== undefined ||
      flags.maxTokens !== undefined ||
      flags.quiet,
  );

  let preReadStdin: string | undefined = opts?.stdin;

  if (flags.positionals.length === 0 && !flags.prompt && !hasChatFlags) {
    if (flags.top !== undefined) return runRecommend(flags, out);
    if (flags.use || flags.maxParams || flags.json || flags.local) {
      if (preReadStdin === undefined && hasPipedStdin()) {
        preReadStdin = await readStdin();
      }
      if (!preReadStdin?.trim()) {
        if (flags.use || flags.maxParams) return runRecommend(flags, out);
        return runModels(flags, out);
      }
    }
  }

  // Subcommand names double as ordinary chat words: models/recommend/config
  // only dispatch as the sole positional, so `qwen models are great` chats.
  // `pull` always dispatches and validates its own arity.
  if (flags.positionals.length <= 1 || command === "pull") {
    switch (command) {
      case "models":
        return runModels({ ...flags, positionals: flags.positionals.slice(1) }, out);
      case "recommend":
        return runRecommend({ ...flags, positionals: flags.positionals.slice(1) }, out);
      case "config":
        return runConfig(flags, out);
      case "pull": {
        const [_, tag, extra] = flags.positionals;
        if (!tag || extra !== undefined) {
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
        break;
    }
  }
  if (flags.top !== undefined) {
    err("error: --top only applies to recommend (no prompt expected)");
    return 2;
  }
  if (flags.json && flags.quiet) {
    err("error: --json and --quiet cannot be combined for chat output");
    return 2;
  }
  return runChat(flags, preReadStdin);
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

const entryPoint = process.argv[1];
const invokedAsCli = entryPoint
  ? canonicalPath(entryPoint) === canonicalPath(fileURLToPath(import.meta.url))
  : false;
if (invokedAsCli) {
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    process.exitCode = 1;
  });
  process.stderr.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    process.exitCode = 1;
  });
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

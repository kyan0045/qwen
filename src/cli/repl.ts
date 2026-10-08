import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Qwen } from "../client";
import { resolveModelName } from "../client";
import { type QwenModel, resolveModel } from "../models";
import { defaultModelFor } from "../providers";
import type { Message } from "../types";
import { collectStreamText } from "./collect-stream";
import { REPL_HELP } from "./help";
import { startSpinner } from "./spinner";
import { formatStats } from "./stats";

export interface ReplOptions {
  client: Qwen;
  model?: string;
  system?: string;
  thinking?: boolean;
  thinkingBudget?: number;
  enableSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function runRepl(options: ReplOptions, out: (s: string) => void): Promise<void> {
  const rl = createInterface({ input, output, terminal: true });
  const history: Message[] = [];
  if (options.system) history.push({ role: "system", content: options.system });

  let model: string | QwenModel | undefined = options.model;
  let thinking = options.thinking;
  let current = options.client.model(model);

  out(`qwen REPL: ${current?.name ?? String(model ?? "default model")}`);
  out("Type /help for commands.\n");

  const banner = () => "qwen> ";

  while (true) {
    let line: string;
    try {
      line = (await rl.question(banner())).trim();
    } catch {
      out("");
      break;
    }
    if (!line) continue;

    if (line.startsWith("/")) {
      const [cmd, ...rest] = line.split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd) {
        case "/exit":
        case "/quit":
          rl.close();
          return;
        case "/help":
          out(REPL_HELP);
          break;
        case "/clear":
          history.length = 0;
          if (options.system) history.push({ role: "system", content: options.system });
          out("history cleared");
          break;
        case "/model":
          if (!arg) {
            out(`model: ${current?.name ?? String(model ?? "default")}`);
            break;
          }
          model = arg;
          current = resolveModel(arg);
          out(`model: ${current?.name ?? arg}`);
          break;
        case "/thinking": {
          const value = arg.toLowerCase();
          if (!arg) {
            thinking = !thinking;
          } else if (value === "on" || value === "true" || value === "1") {
            thinking = true;
          } else if (value === "off" || value === "false" || value === "0") {
            thinking = false;
          } else {
            out("usage: /thinking on|off");
            break;
          }
          out(`thinking: ${thinking ? "on" : "off"}`);
          break;
        }
        case "/system":
          options.system = arg || undefined;
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]?.role === "system") history.splice(i, 1);
          }
          if (options.system) history.unshift({ role: "system", content: options.system });
          out(options.system ? "system prompt set" : "system prompt cleared");
          break;
        default:
          out(`Unknown command ${cmd}. Try /help.`);
      }
      continue;
    }

    const mark = history.length;
    history.push({ role: "user", content: line });
    out("");
    const spinner = startSpinner();
    const started = Date.now();
    try {
      const stream = options.client.chatStream({
        messages: history,
        model,
        thinking,
        thinkingBudget: options.thinkingBudget,
        enableSearch: options.enableSearch,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
      const { answer, reasoning, usage } = await collectStreamText(stream, (text) => {
        spinner.stop();
        process.stdout.write(text);
      });
      process.stdout.write("\n\n");
      const sentModel = resolveModelName(
        model,
        options.client.config,
        defaultModelFor(options.client.config),
      );
      process.stderr.write(`\n${formatStats(sentModel, usage, Date.now() - started)}\n`);
      if (!answer && !reasoning) {
        history.splice(mark, 1);
      } else if (reasoning) {
        history.push({ role: "assistant", content: answer, reasoningContent: reasoning });
      } else {
        history.push({ role: "assistant", content: answer });
      }
    } catch (error) {
      history.splice(mark, 1);
      out(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      spinner.stop();
    }
  }
  rl.close();
}

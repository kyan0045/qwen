import { type QwenModel, models } from "../../models";
import type { CliFlags } from "../args";

function row(m: QwenModel): string[] {
  return [
    m.id,
    m.params ?? "-",
    m.thinking,
    m.capabilities.join(","),
    m.ollamaTag ?? "-",
    m.dashscopeId ?? "-",
    m.legacy ? "legacy" : m.preview ? "preview" : m.cloudOnly ? "cloud" : "",
  ];
}

const HEADERS = ["ID", "PARAMS", "THINK", "CAPS", "OLLAMA", "DASHSCOPE", "FLAGS"];

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printTable(rows: string[][]): string {
  const all = [HEADERS, ...rows];
  const widths = HEADERS.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)));
  return all
    .map((r) =>
      r
        .map((cell, i) => pad(cell, widths[i] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export async function runModels(flags: CliFlags, out: (s: string) => void): Promise<number> {
  if (flags.local) {
    const { Qwen } = await import("../../client");
    const client = new Qwen({ provider: "ollama", model: "qwen3.8:27b" });
    const local = await client.listLocalModels();
    const known = local.filter((l) => l.tag.startsWith("qwen") || l.tag.startsWith("qwq"));
    if (flags.json) {
      out(JSON.stringify(known, null, 2));
      return 0;
    }
    if (!known.length) {
      out("No Qwen models installed in Ollama. Try `qwen pull qwen3.8:27b`.");
      return 0;
    }
    out(
      printTable(
        known.map((l) => [l.tag, l.parameterSize ?? "-", "-", "-", l.tag, "-", "installed"]),
      ),
    );
    return 0;
  }

  const list =
    flags.use === "embed" ? models.filter((m) => m.capabilities.includes("embed")) : models;
  if (flags.json) {
    out(JSON.stringify(list, null, 2));
    return 0;
  }
  out(printTable(list.map(row)));
  out("");
  out(`${list.length} models. legacy/preview/cloud are hidden from \`qwen recommend\` by default.`);
  return 0;
}

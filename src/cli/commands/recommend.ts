import { type QwenModel, recommendAll } from "../../models";
import type { CliFlags } from "../args";

function describe(m: QwenModel): string {
  const bits = [m.name];
  if (m.params) bits.push(m.params);
  bits.push(`${Math.round(m.contextWindow / 1024)}K ctx`);
  bits.push(m.thinking === "none" ? "no thinking" : `${m.thinking} thinking`);
  if (m.ollamaTag) bits.push(`ollama: ${m.ollamaTag}`);
  if (m.dashscopeId) bits.push(`dashscope: ${m.dashscopeId}`);
  return bits.join("  ·  ");
}

export async function runRecommend(flags: CliFlags, out: (s: string) => void): Promise<number> {
  const top = flags.top ?? 5;
  const list = recommendAll({
    use: flags.use ?? "chat",
    local: flags.local,
    maxParams: flags.maxParams,
    thinking: flags.thinking,
    vision: flags.use === "vision" || undefined,
  }).slice(0, top);

  if (!list.length) {
    out("No model matched. Try relaxing --max-params or adding --local=false.");
    return 1;
  }

  if (flags.json) {
    out(JSON.stringify(list, null, 2));
    return 0;
  }

  const [best, ...rest] = list;
  out(`pick  ${describe(best!)}`);
  if (rest.length) {
    out("");
    out("also");
    for (const m of rest) out(`  -   ${describe(m)}`);
  }
  return 0;
}

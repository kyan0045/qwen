import type { Usage } from "../types";

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * One-line stderr summary for a finished chat: the model id actually sent,
 * plus token counts and speed when the provider reported usage, otherwise
 * just wall time.
 */
export function formatStats(model: string, usage: Usage | undefined, elapsedMs: number): string {
  if (!usage) return `[${model} · ${seconds(elapsedMs)} total]`;
  const elapsed = Math.max(elapsedMs, 1);
  const perSecond = (usage.completionTokens / (elapsed / 1000)).toFixed(1);
  return `[${model} · prompt ${usage.promptTokens} · completion ${usage.completionTokens} · ${perSecond} tokens/s · ${seconds(elapsedMs)} total]`;
}

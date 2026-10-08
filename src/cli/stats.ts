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
  const label = model?.trim() ? model : "(unknown model)";
  if (!usage) return `[${label} · ${seconds(elapsedMs)} total]`;
  const promptTokens = Number.isFinite(usage.promptTokens) ? usage.promptTokens : 0;
  const completionTokens = Number.isFinite(usage.completionTokens) ? usage.completionTokens : 0;
  const elapsed = Math.max(elapsedMs, 1);
  const perSecond = (completionTokens / (elapsed / 1000)).toFixed(1);
  return `[${label} · prompt ${promptTokens} · completion ${completionTokens} · ${perSecond} tokens/s · ${seconds(elapsedMs)} total]`;
}

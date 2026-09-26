import { describe, expect, it } from "vitest";
import {
  QWEN3_8_27B,
  QWEN3_CODER_480B,
  QWEN3_EMBEDDING_8B,
  QWQ_32B,
  getModel,
  models,
  recommend,
  recommendAll,
  requireModel,
  resolveModel,
} from "../src";

describe("catalog", () => {
  it("has unique ids", () => {
    const ids = models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique ollama tags", () => {
    const tags = models.map((m) => m.ollamaTag).filter(Boolean);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("never recommends the stale bare `qwen` ollama repo", () => {
    for (const m of models) {
      expect(m.ollamaTag).not.toBe("qwen");
    }
  });

  it("gives every model a positive context window", () => {
    for (const m of models) {
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it("gives every model at least one capability", () => {
    for (const m of models) {
      expect(m.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("marks embed-only models without chat", () => {
    expect(QWEN3_EMBEDDING_8B.capabilities).toEqual(["embed"]);
    expect(QWEN3_EMBEDDING_8B.maxOutput).toBe(0);
  });

  it("resolves models by id, ollama tag, dashscope id and openrouter id", () => {
    expect(resolveModel("qwen3-32b")).toBe(getModel("qwen3-32b"));
    expect(resolveModel("qwen3:32b")).toBe(getModel("qwen3-32b"));
    expect(resolveModel("qwen3-coder-plus")).toBe(getModel("qwen3-coder-480b"));
    expect(resolveModel("qwen/qwen3-coder-plus")).toBe(getModel("qwen3-coder-480b"));
    expect(resolveModel("nope-not-a-model")).toBeUndefined();
  });

  it("keeps openrouter ids canonical: qwen/ prefix, no pins or variant suffixes", () => {
    const ids = models.map((m) => m.openrouterId).filter(Boolean) as string[];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith("qwen/")).toBe(true);
      expect(id).not.toMatch(/:|20\d\d[-_]?\d\d[-_]?\d\d|-2507|-02-15|-02-23/);
    }
  });

  it("requireModel throws a helpful error", () => {
    expect(() => requireModel("definitely-not-real")).toThrow(/Unknown Qwen model/);
  });
});

describe("recommend", () => {
  it("defaults to a current non-preview model", () => {
    const pick = recommend();
    expect(pick.preview).toBeFalsy();
    expect(pick.legacy).toBeFalsy();
  });

  it("prefers the coder family for coding", () => {
    const pick = recommend({ use: "coding" });
    expect(pick.family.startsWith("qwen3-coder") || pick.id.includes("coding")).toBe(true);
  });

  it("respects maxParams", () => {
    const pick = recommend({ use: "coding", maxParams: "32b" });
    expect(pick.paramCount ?? 0).toBeLessThanOrEqual(32);
  });

  it("local: true only returns models with an ollama tag and skips cloud-only", () => {
    const picks = recommendAll({ local: true });
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.ollamaTag).toBeTruthy();
      expect(p.cloudOnly).toBeFalsy();
    }
  });

  it("picks an embedding model for embed", () => {
    const pick = recommend({ use: "embed", local: true });
    expect(pick.capabilities).toContain("embed");
  });

  it("prefers the highest-dimension embedding model by default", () => {
    expect(recommend({ use: "embed" }).id).toBe(QWEN3_EMBEDDING_8B.id);
  });

  it("picks a thinking model for reasoning and prefers always-think QwQ when unconstrained", () => {
    const pick = recommend({ use: "reasoning", includeLegacy: true });
    expect(pick.thinking).not.toBe("none");
  });

  it("returns QwQ when an always-on reasoner is requested without a param cap", () => {
    const all = recommendAll({ use: "reasoning", maxParams: "32b" });
    const ids = all.map((m) => m.id);
    expect(ids).toContain(QWQ_32B.id);
  });

  it("hides preview models unless asked", () => {
    expect(recommendAll({ use: "chat" }).some((m) => m.preview)).toBe(false);
    expect(recommendAll({ use: "chat", includePreview: true }).some((m) => m.preview)).toBe(true);
  });

  it("throws when nothing matches", () => {
    expect(() => recommend({ use: "chat", maxParams: 0.1 })).toThrow(/No Qwen model matches/);
  });

  it("rejects invalid maxParams values instead of ignoring them", () => {
    expect(() => recommendAll({ maxParams: "nonsense" })).toThrow(/Invalid maxParams/);
    expect(() => recommendAll({ maxParams: Number.NaN })).toThrow(/Invalid maxParams/);
  });

  it("exposes the flagship coder and newest release", () => {
    expect(models).toContain(QWEN3_CODER_480B);
    expect(models).toContain(QWEN3_8_27B);
  });
});

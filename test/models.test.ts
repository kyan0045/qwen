import { describe, expect, it } from "vitest";
import {
  QWEN3_8_27B,
  QWEN3_8_FLASH,
  QWEN3_8_FLASH_NEXT,
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

  it("keeps Qwen3.8 provider mappings and output limits current", () => {
    expect(QWEN3_8_27B.dashscopeId).toBe("qwen3.8-27b");
    expect(QWEN3_8_27B.maxOutput).toBe(131072);
    expect(getModel("qwen3.8-max")?.openrouterId).toBe("qwen/qwen3.8-max");
    expect(getModel("qwen3.8-omni-flash")?.maxOutput).toBe(131072);
    expect(getModel("qwen3.8-flash-next")?.maxOutput).toBe(131072);
    expect(getModel("qwen3.8-2.4t-a95b")?.dashscopeId).toBe("qwen3.8-2.4t-a95b");
  });

  it("keeps Qwen3.6, Qwen3-Coder/VL/Embedding, QwQ, and Qwen2.5 specs and mappings current", () => {
    expect(getModel("qwen3.6-27b")?.dashscopeId).toBe("qwen3.6-27b");
    expect(getModel("qwen3.6-35b-a3b")?.dashscopeId).toBe("qwen3.6-35b-a3b");
    expect(getModel("qwen3-next-80b-a3b")?.dashscopeId).toBe("qwen3-next-80b-a3b-instruct");
    expect(getModel("qwen3-coder-30b")?.dashscopeId).toBe("qwen3-coder-flash");

    for (const [id, dsId] of [
      ["qwen3-vl-8b", "qwen3-vl-8b-instruct"],
      ["qwen3-vl-32b", "qwen3-vl-32b-instruct"],
      ["qwen3-vl-235b", "qwen3-vl-235b-a22b-instruct"],
    ] as const) {
      const m = getModel(id);
      expect(m?.contextWindow).toBe(262144);
      expect(m?.dashscopeId).toBe(dsId);
    }
    expect(getModel("qwen3-vl-235b")?.params).toBe("235B-A22B");

    expect(QWQ_32B.contextWindow).toBe(131072);
    expect(QWQ_32B.openrouterId).toBe("qwen/qwq-32b");
    expect(QWEN3_EMBEDDING_8B.openrouterId).toBe("qwen/qwen3-embedding-8b");
    expect(getModel("qwen3-embedding-0.6b")?.openrouterId).toBe("qwen/qwen3-embedding-0.6b");
    expect(getModel("qwen3-embedding-4b")?.openrouterId).toBe("qwen/qwen3-embedding-4b");
    expect(getModel("qwen3-0.6b")?.openrouterId).toBe("qwen/qwen3-0.6b");
    expect(getModel("qwen3-1.7b")?.openrouterId).toBe("qwen/qwen3-1.7b");
    expect(getModel("qwen3-4b")?.openrouterId).toBe("qwen/qwen3-4b");
    expect(getModel("qwen2.5-vl-32b")?.openrouterId).toBe("qwen/qwen2.5-vl-32b-instruct");
    expect(getModel("qwen-turbo")?.openrouterId).toBe("qwen/qwen-turbo");
    expect(getModel("qwen-max")?.openrouterId).toBe("qwen/qwen-max");
  });

  it("validates minContext values", () => {
    expect(() => recommendAll({ minContext: Number.NaN })).toThrow(/Invalid minContext/);
    expect(() => recommendAll({ minContext: -1 })).toThrow(/Invalid minContext/);
    expect(recommendAll({ minContext: 1_000_000 }).every((m) => m.contextWindow >= 1_000_000)).toBe(
      true,
    );
  });

  it("includes cloud-only models only when asked", () => {
    expect(recommendAll({}).some((m) => m.cloudOnly)).toBe(false);
    expect(recommendAll({ includeCloud: true }).some((m) => m.cloudOnly)).toBe(true);
  });

  it("parses m/mb/t/tb param units and rejects garbage", () => {
    expect(recommendAll({ maxParams: "2400m", includeCloud: true }).length).toBeGreaterThan(0);
    expect(() => recommendAll({ maxParams: "32bb" })).toThrow(/Invalid maxParams/);
    expect(() => recommendAll({ maxParams: -5 })).toThrow(/Invalid maxParams/);
    expect(() => recommendAll({ maxParams: "-5" })).toThrow(/Invalid maxParams/);
  });

  it("rejects unknown use presets", () => {
    expect(() => recommendAll({ use: "translate" as never })).toThrow(/Invalid use/);
    expect(() => recommendAll({ use: "dancing" as never })).toThrow(/Invalid use/);
  });

  it("resolves ids case-insensitively and leaves ambiguous bare repos unresolved", () => {
    expect(getModel("QWEN3-32B")?.id).toBe("qwen3-32b");
    expect(resolveModel("qwen3.5")).toBeUndefined();
    expect(resolveModel("qwq")?.id).toBe("qwq-32b");
    expect(resolveModel("QWEN3-CODER-PLUS")?.id).toBe("qwen3-coder-480b");
  });

  it("only returns thinking models for reasoning", () => {
    for (const m of recommendAll({ use: "reasoning" })) {
      expect(m.thinking).not.toBe("none");
    }
  });

  it("only returns vision models for local vision", () => {
    const picks = recommendAll({ use: "vision", local: true });
    expect(picks.length).toBeGreaterThan(0);
    for (const m of picks) expect(m.capabilities).toContain("vision");
  });

  it("aliases QWEN3_8_FLASH_NEXT to the catalog QWEN3_8_FLASH entry", () => {
    expect(QWEN3_8_FLASH_NEXT).toBe(QWEN3_8_FLASH);
    expect(models).toContain(QWEN3_8_FLASH_NEXT);
  });

  it("excludes embed-only models when use is omitted", () => {
    for (const list of [recommendAll({}), recommendAll({ local: true })]) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((m) => m.capabilities.includes("embed"))).toBe(false);
    }
  });
});

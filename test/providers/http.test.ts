import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionError,
  RateLimitError,
} from "../../src/errors";
import { ndjsonLines, rawRequest, requestJSON, sseData } from "../../src/providers/http";

function sseResponse(text: string): Response {
  return new Response(text, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(text: string): Promise<string[]> {
  const out: string[] = [];
  for await (const data of sseData(sseResponse(text))) out.push(data);
  return out;
}

describe("sseData", () => {
  it("yields one payload per single-line data event", async () => {
    const events = await collect('data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("joins multi-line data events into one payload", async () => {
    const events = await collect('data: {"a":\ndata: 1}\n\ndata: [DONE]\n\n');
    expect(events).toEqual(['{"a":\n1}']);
  });

  it("flushes a final data line without a trailing newline", async () => {
    const events = await collect('data: {"a":1}\n\ndata: {"b":2}');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("flushes a final multi-line event at end of stream", async () => {
    const events = await collect('data: {"a":\ndata: 1}');
    expect(events).toEqual(['{"a":\n1}']);
  });

  it("stops at [DONE] and ignores comments and other fields", async () => {
    const events = await collect(
      ': keep-alive\nevent: message\ndata: {"a":1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n',
    );
    expect(events).toEqual(['{"a":1}']);
  });

  it("still emits each complete JSON line immediately when events lack blank lines", async () => {
    const events = await collect('data: {"a":1}\ndata: {"b":2}\n');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rawRequest", () => {
  it("preserves an explicit authorization header regardless of case", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        seen.push(init ?? {});
        return jsonResponse({ ok: true });
      }),
    );

    await requestJSON({
      baseURL: "http://mock.test",
      path: "/items",
      apiKey: "secret",
      headers: { Authorization: "Bearer custom" },
      body: {},
    });

    const headers = (seen[0]!.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer custom");
    expect(headers).not.toHaveProperty("authorization");
  });

  it("adds bearer auth when no authorization header is supplied", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        seen.push(init ?? {});
        return jsonResponse({ ok: true });
      }),
    );

    await requestJSON({ baseURL: "http://mock.test", path: "/items", apiKey: "secret", body: {} });
    const headers = (seen[0]!.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");
  });

  it("lets caller aborts propagate as abort errors", async () => {
    const abortError = new DOMException("stopped", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortError;
      }),
    );

    await expect(
      rawRequest({ baseURL: "http://mock.test", path: "/items", body: {} }),
    ).rejects.toBe(abortError);
  });

  it("maps representative HTTP failures to typed errors", async () => {
    const cases: Array<[number, new (...args: never[]) => Error]> = [
      [400, BadRequestError],
      [401, AuthenticationError],
      [403, PermissionError],
      [404, NotFoundError],
      [429, RateLimitError],
      [500, APIError],
    ];
    for (const [status, Type] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ error: { message: `status ${status}` } }, status)),
      );
      await expect(
        rawRequest({ baseURL: "http://mock.test", path: "/items", body: {} }),
      ).rejects.toBeInstanceOf(Type);
    }
  });

  it("wraps invalid JSON success bodies instead of throwing a syntax error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    const payload = await requestJSON({ baseURL: "http://mock.test", path: "/items", body: {} });
    expect(payload).toEqual({ message: "not json" });
  });
});

describe("stream cancellation", () => {
  it("cancels SSE and NDJSON readers when consumers stop early", async () => {
    const encoder = new TextEncoder();
    const sseCancelled = await cancelEarly((cancelled) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
        },
        cancel() {
          cancelled.value = true;
        },
      });
      return sseData(new Response(body));
    });
    expect(sseCancelled).toBe(true);

    const ndjsonCancelled = await cancelEarly((cancelled) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"line":1}\n'));
        },
        cancel() {
          cancelled.value = true;
        },
      });
      return ndjsonLines(new Response(body));
    });
    expect(ndjsonCancelled).toBe(true);
  });
});

async function cancelEarly(
  create: (cancelled: { value: boolean }) => AsyncGenerator<string>,
): Promise<boolean> {
  const cancelled = { value: false };
  const generator = create(cancelled);
  const first = await generator.next();
  expect(first.done).toBe(false);
  await generator.return(undefined);
  return cancelled.value;
}

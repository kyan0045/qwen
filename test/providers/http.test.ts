import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  ConnectionError,
  NotFoundError,
  PermissionError,
  RateLimitError,
} from "../../src/errors";
import {
  effectiveSignal,
  ndjsonLines,
  rawRequest,
  requestJSON,
  sseData,
} from "../../src/providers/http";

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
      [422, BadRequestError],
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

  it("maps requestJSON body timeouts to ConnectionError with timeoutMs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason ?? new DOMException("timed out", "TimeoutError"));
            });
          }),
      })),
    );
    const error = await requestJSON({
      baseURL: "http://mock.test",
      path: "/items",
      body: {},
      timeoutMs: 10,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionError);
    expect((error as Error).message).toMatch(/timed out after 10ms/);
  });

  it("ignores whitespace and negative Retry-After headers while keeping valid ones", async () => {
    for (const [header, expected] of [
      ["   ", undefined],
      ["-5", undefined],
      ["0", 0],
      ["12", 12],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ error: { message: "rate" } }), {
              status: 429,
              headers: { "retry-after": header },
            }),
        ),
      );
      const err = await rawRequest({ baseURL: "http://mock.test", path: "/items", body: {} }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(expected);
    }
  });
});

describe("stream cancellation", () => {
  it("maps hanging stream timeouts to ConnectionError with timeoutMs", async () => {
    const hangingResponse = () => new Response(new ReadableStream({ start() {} }), { status: 200 });

    const sseSignal = effectiveSignal({ timeoutMs: 10 });
    const sseErr = await (async () => {
      for await (const _ of sseData(hangingResponse(), sseSignal, "/chat/completions")) {
        // drain
      }
    })().catch((e: unknown) => e);
    expect(sseErr).toBeInstanceOf(ConnectionError);
    expect((sseErr as Error).message).toMatch(/\/chat\/completions timed out after 10ms/);

    const ndjsonSignal = effectiveSignal({ timeoutMs: 10 });
    const ndjsonErr = await (async () => {
      for await (const _ of ndjsonLines(hangingResponse(), ndjsonSignal, "/api/chat")) {
        // drain
      }
    })().catch((e: unknown) => e);
    expect(ndjsonErr).toBeInstanceOf(ConnectionError);
    expect((ndjsonErr as Error).message).toMatch(/\/api\/chat timed out after 10ms/);
  });
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

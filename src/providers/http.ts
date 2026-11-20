import { ConnectionError, errorFromCause, errorFromResponse } from "../errors";

export interface HttpOptions {
  baseURL: string;
  path: string;
  method?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  stream?: boolean;
}

export function joinURL(baseURL: string, path: string): string {
  const base = baseURL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

const signalTimeouts = new WeakMap<AbortSignal, number>();

export function signalTimeoutMs(signal?: AbortSignal): number | undefined {
  return signal ? signalTimeouts.get(signal) : undefined;
}

export function isAbortError(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === "AbortError") return true;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}

export function isTimeoutError(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === "TimeoutError") return true;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "TimeoutError"
  );
}

export function timeoutError(
  path: string,
  timeoutMs: number | undefined,
  cause: unknown,
): ConnectionError {
  const message =
    timeoutMs !== undefined
      ? `Request to ${path} timed out after ${timeoutMs}ms.`
      : `Request to ${path} timed out.`;
  return new ConnectionError(message, { cause });
}

/**
 * Combine a caller signal with an opt-in timeout. Verified: a timeout abort
 * propagates with reason `TimeoutError` (not `AbortError`), which callers map
 * to `ConnectionError`.
 */
export function effectiveSignal(opts?: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): AbortSignal | undefined {
  if (opts?.timeoutMs !== undefined) {
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 0) {
      throw new ConnectionError(
        `Invalid timeoutMs ${String(opts.timeoutMs)}. Must be a finite number >= 0.`,
      );
    }
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const combined = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    signalTimeouts.set(combined, opts.timeoutMs);
    return combined;
  }
  return opts?.signal;
}

export async function requestJSON<T>(opts: HttpOptions): Promise<T> {
  const signal = opts.timeoutMs !== undefined ? effectiveSignal(opts) : opts.signal;
  const effectiveTimeoutMs = opts.timeoutMs ?? signalTimeoutMs(signal);
  const response = await rawRequest({ ...opts, signal, timeoutMs: undefined });
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (isTimeoutError(cause)) throw timeoutError(opts.path, effectiveTimeoutMs, cause);
    throw errorFromCause(cause);
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }
  return parsed as T;
}

export async function rawRequest(opts: HttpOptions): Promise<Response> {
  const headers: Record<string, string> = {
    accept: opts.stream ? "text/event-stream" : "application/json",
    ...(opts.headers ?? {}),
  };
  if (
    opts.body !== undefined &&
    !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")
  ) {
    headers["content-type"] = "application/json";
  }
  const hasAuthorization = Object.keys(headers).some(
    (name) => name.toLowerCase() === "authorization",
  );
  if (opts.apiKey && !hasAuthorization) {
    headers.authorization = `Bearer ${opts.apiKey}`;
  }

  let response: Response;
  const signal = opts.timeoutMs !== undefined ? effectiveSignal(opts) : opts.signal;
  const effectiveTimeoutMs = opts.timeoutMs ?? signalTimeoutMs(signal);
  try {
    response = await fetch(joinURL(opts.baseURL, opts.path), {
      method: opts.method ?? "POST",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (isTimeoutError(cause)) {
      throw timeoutError(opts.path, effectiveTimeoutMs, cause);
    }
    throw errorFromCause(cause);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch (cause) {
      if (isAbortError(cause)) throw cause;
      if (isTimeoutError(cause)) throw timeoutError(opts.path, effectiveTimeoutMs, cause);
      try {
        body = await response.text();
      } catch (inner) {
        if (isAbortError(inner)) throw inner;
        if (isTimeoutError(inner)) throw timeoutError(opts.path, effectiveTimeoutMs, inner);
        body = undefined;
      }
    }
    const retryAfterRaw = response.headers.get("retry-after")?.trim();
    const retryAfterNum = retryAfterRaw ? Number(retryAfterRaw) : undefined;
    const retryAfter =
      retryAfterNum !== undefined && Number.isFinite(retryAfterNum) && retryAfterNum >= 0
        ? retryAfterNum
        : undefined;
    throw errorFromResponse(response.status, body, retryAfter);
  }

  return response;
}

function isCompleteJSON(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

type ByteReadResult = { done: boolean; value?: Uint8Array };
interface ByteReader {
  read(): Promise<ByteReadResult>;
}

async function readWithSignal(reader: ByteReader, signal?: AbortSignal): Promise<ByteReadResult> {
  signal?.throwIfAborted();
  if (!signal) return reader.read();
  return new Promise<ByteReadResult>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export async function* sseData(
  response: Response,
  signal?: AbortSignal,
  path?: string,
): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const takeEvent = (force: boolean): string | undefined => {
    if (dataLines.length === 0) return undefined;
    const payload = dataLines.join("\n");
    if (!force && payload.trim() !== "[DONE]" && !isCompleteJSON(payload)) return undefined;
    dataLines = [];
    return payload;
  };

  try {
    outer: while (true) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) buffer += decoder.decode();
      else buffer += decoder.decode(value, { stream: true });

      while (true) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);

        if (line === "") {
          const payload = takeEvent(true);
          if (payload?.trim() === "[DONE]") break outer;
          if (payload !== undefined) yield payload;
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ +/, ""));
          const payload = takeEvent(false);
          if (payload?.trim() === "[DONE]") break outer;
          if (payload !== undefined) yield payload;
        }
      }

      if (done) {
        if (buffer) {
          const line = buffer.replace(/\r$/, "");
          buffer = "";
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ +/, ""));
          }
        }
        const payload = takeEvent(true);
        if (payload !== undefined && payload.trim() !== "[DONE]") yield payload;
        break;
      }
    }
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (isTimeoutError(cause)) {
      throw timeoutError(path ?? "stream", signalTimeoutMs(signal), cause);
    }
    throw cause;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* ndjsonLines(
  response: Response,
  signal?: AbortSignal,
  path?: string,
): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (line.trim()) yield line;
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) yield tail;
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (isTimeoutError(cause)) {
      throw timeoutError(path ?? "stream", signalTimeoutMs(signal), cause);
    }
    throw cause;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function parseJSON<T>(text: string): T {
  return JSON.parse(text) as T;
}

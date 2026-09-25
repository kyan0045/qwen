import { errorFromCause, errorFromResponse } from "../errors";

export interface HttpOptions {
  baseURL: string;
  path: string;
  method?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  stream?: boolean;
}

export function joinURL(baseURL: string, path: string): string {
  const base = baseURL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isAbortError(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === "AbortError") return true;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}

export async function requestJSON<T>(opts: HttpOptions): Promise<T> {
  const response = await rawRequest(opts);
  const text = await response.text();
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
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  const hasAuthorization = Object.keys(headers).some(
    (name) => name.toLowerCase() === "authorization",
  );
  if (opts.apiKey && !hasAuthorization) {
    headers.authorization = `Bearer ${opts.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(joinURL(opts.baseURL, opts.path), {
      method: opts.method ?? "POST",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    throw errorFromCause(cause);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      try {
        body = await response.text();
      } catch {
        body = undefined;
      }
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw errorFromResponse(
      response.status,
      body,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
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

export async function* sseData(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const takeEvent = (force: boolean): string | undefined => {
    if (dataLines.length === 0) return undefined;
    const payload = dataLines.join("\n");
    if (!force && payload !== "[DONE]" && !isCompleteJSON(payload)) return undefined;
    dataLines = [];
    return payload;
  };

  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) buffer += decoder.decode();
      else buffer += decoder.decode(value, { stream: true });

      while (true) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);

        if (line === "") {
          const payload = takeEvent(true);
          if (payload === "[DONE]") break outer;
          if (payload !== undefined) yield payload;
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
          const payload = takeEvent(false);
          if (payload === "[DONE]") break outer;
          if (payload !== undefined) yield payload;
        }
      }

      if (done) {
        if (buffer) {
          const line = buffer.replace(/\r$/, "");
          buffer = "";
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
        const payload = takeEvent(true);
        if (payload !== undefined && payload !== "[DONE]") yield payload;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* ndjsonLines(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
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
    const tail = buffer.trim();
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function parseJSON<T>(text: string): T {
  return JSON.parse(text) as T;
}

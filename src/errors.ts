export class QwenError extends Error {
  override name = "QwenError";
  readonly status?: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    options?: { status?: number; code?: string; body?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.status = options?.status;
    this.code = options?.code;
    this.body = options?.body;
  }
}

export class AuthenticationError extends QwenError {
  override name = "AuthenticationError";
}

export class PermissionError extends QwenError {
  override name = "PermissionError";
}

export class NotFoundError extends QwenError {
  override name = "NotFoundError";
}

export class RateLimitError extends QwenError {
  override name = "RateLimitError";
  readonly retryAfter?: number;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      body?: unknown;
      cause?: unknown;
      retryAfter?: number;
    },
  ) {
    super(message, options);
    this.retryAfter = options?.retryAfter;
  }
}

export class BadRequestError extends QwenError {
  override name = "BadRequestError";
}

export class APIError extends QwenError {
  override name = "APIError";
}

export class ConfigurationError extends QwenError {
  override name = "ConfigurationError";
}

export class ConnectionError extends QwenError {
  override name = "ConnectionError";
}

function readMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const error = b.error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.msg === "string") return e.msg;
  }
  for (const key of ["message", "msg", "error", "code"]) {
    const v = b[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const error = b.error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    if (typeof e.type === "string") return e.type;
  }
  return typeof b.code === "string" ? b.code : undefined;
}

export function errorFromResponse(status: number, body: unknown, retryAfter?: number): QwenError {
  const message = readMessage(body) ?? `Request failed with status ${status}`;
  const code = readCode(body);
  const options = { status, code, body, retryAfter };
  if (status === 401 || status === 403) {
    return status === 401
      ? new AuthenticationError(message, options)
      : new PermissionError(message, options);
  }
  if (status === 404) return new NotFoundError(message, options);
  if (status === 429) return new RateLimitError(message, options);
  if (status === 400 || status === 422) return new BadRequestError(message, options);
  return new APIError(message, options);
}

export function errorFromCause(cause: unknown): QwenError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new ConnectionError(`Could not reach the Qwen provider: ${message}`, { cause });
}

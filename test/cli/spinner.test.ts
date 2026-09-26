import { afterEach, describe, expect, it, vi } from "vitest";
import { startSpinner } from "../../src/cli/spinner";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startSpinner", () => {
  it("is a no-op when stderr is not a TTY", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const spinner = startSpinner();
    expect(() => spinner.stop()).not.toThrow();
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it("animates and clears the line on a TTY", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    try {
      const spinner = startSpinner();
      expect(process.stderr.write).toHaveBeenCalledOnce();
      spinner.stop();
      spinner.stop();
      const last = vi.mocked(process.stderr.write).mock.calls.at(-1)?.[0];
      expect(last).toBe("\r\x1b[K");
    } finally {
      Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    }
  });
});

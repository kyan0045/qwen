export interface Spinner {
  stop(): void;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Braille spinner on stderr. No-op when stderr is not a TTY, so pipes stay clean. */
export function startSpinner(label = "thinking"): Spinner {
  if (process.stderr.isTTY !== true) return { stop() {} };
  let frame = 0;
  process.stderr.write(`\r${FRAMES[0]} ${label}...`);
  const timer = setInterval(() => {
    frame += 1;
    process.stderr.write(`\r${FRAMES[frame % FRAMES.length]} ${label}...`);
  }, 80);
  timer.unref();
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stderr.write("\r\x1b[K");
    },
  };
}

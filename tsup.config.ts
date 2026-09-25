import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node22",
    outDir: "dist",
    treeshake: true,
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    target: "node22",
    outDir: "dist",
    treeshake: true,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);

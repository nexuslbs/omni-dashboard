// Node 20-compatible TypeScript loader for `node --test`.
//
// Node < 22.6 cannot execute .ts test files natively and throws
// ERR_UNKNOWN_FILE_EXTENSION (type stripping is only enabled by default from
// Node >= 22.18). This loader transpiles .ts on the fly with esbuild (already
// a dependency via vite), so `node --test` works on any Node >= 20.6 when the
// test scripts pass `--import ./ts-loader.mjs`.
//
// The module self-registers via `module.register()`: on Node 20, `--import`
// alone does not attach exported loader hooks (only `--loader` does, which is
// deprecated on Node >= 22), so `register()` makes the same loader work on
// both Node 20 and Node >= 22.
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { transformSync } from "esbuild";

register("./ts-loader.mjs", import.meta.url);

// Resolve extension-less relative imports ("../src/lib/plugin-ui" -> ".ts") so tests
// can import ANY source module, not only the ones without relative imports.
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative) {
    // "../src/lib/plugin-ui" -> "../src/lib/plugin-ui.ts"
    if (!/\.[a-z]+$/.test(specifier)) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through to the default resolution */
      }
    }
    // "./helpers.js" (NodeNext-style) -> "./helpers.ts": TS sources ship as .ts
    if (/\.js$/.test(specifier)) {
      try {
        return await nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        /* fall through to the default resolution */
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx") || url.endsWith(".mts")) {
    const source = readFileSync(new URL(url), "utf8");
    const { code } = transformSync(source, {
      loader: url.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      sourcefile: url,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}

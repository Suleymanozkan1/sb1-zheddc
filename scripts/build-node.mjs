// Bundles a Node service: workspace packages (TypeScript sources) are inlined; third-party
// dependencies stay external. Each external import is resolved at build time from the importing
// file's own package (pnpm strict layout) and rewritten to a path relative to the bundle, so the
// bundle runs with the repository's node_modules without hoisting.
import { build } from "esbuild";
import { dirname, relative, resolve } from "node:path";

const [entry = "src/main.ts", outfile = "dist/main.js"] = process.argv.slice(2);
const outDir = dirname(resolve(outfile));

await build({
  entryPoints: [resolve(entry)],
  outfile: resolve(outfile),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  plugins: [
    {
      name: "externalize-third-party",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, async (args) => {
          if (args.path.startsWith("@cryptoarena/") || args.path.startsWith("node:") || args.pluginData?.skip) return undefined;
          const r = await b.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind, importer: args.importer, pluginData: { skip: true } });
          if (r.errors.length > 0 || !r.path || !r.path.includes("node_modules")) {
            return { path: args.path, external: true };
          }
          let rel = relative(outDir, r.path).split("\\").join("/");
          if (!rel.startsWith(".")) rel = `./${rel}`;
          return { path: rel, external: true };
        });
      },
    },
  ],
});

// Bundles a Node service: workspace packages (TypeScript sources) are inlined,
// third-party dependencies stay external and are resolved from node_modules at runtime.
import { build } from "esbuild";
import { resolve } from "node:path";

const [entry = "src/main.ts", outfile = "dist/main.js"] = process.argv.slice(2);

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
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@cryptoarena/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

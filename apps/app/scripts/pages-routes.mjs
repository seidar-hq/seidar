// Writes <export dir>/_routes.json so Pages Functions run only for /api/* and the route .txt files
// (functions/_middleware.ts), never for regular pages or assets. Runs after `next build`.
import { readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = process.env.NEXT_DIST_DIR || "out";
const txt = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "_next") walk(p);
    } else if (e.name.endsWith(".txt")) txt.push("/" + relative(out, p).split(sep).join("/"));
  }
};
walk(out);
const include = ["/api/*", ...txt.sort()];
if (include.length > 100) throw new Error(`_routes.json allows 100 rules, got ${include.length}`);
writeFileSync(join(out, "_routes.json"), JSON.stringify({ version: 1, include, exclude: [] }, null, 2));
console.log(`_routes.json: ${include.length} rules`);

// Writes <export dir>/_routes.json so Pages Functions run only for /api/* and the route .txt files
// (functions/_middleware.ts), never for regular pages or assets. Runs after `next build`.
// Also writes <export dir>/sw-manifest.json: every page and the files it loads, which the service
// worker (public/sw.js) saves in the background so any page opens when the site can't be reached.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = process.env.NEXT_DIST_DIR || "out";
const txt = [];
const html = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "_next") walk(p);
    } else if (e.name.endsWith(".txt")) txt.push("/" + relative(out, p).split(sep).join("/"));
    else if (e.name.endsWith(".html") && e.name !== "404.html") html.push(p);
  }
};
walk(out);
const include = ["/api/*", ...txt.sort()];
if (include.length > 100) throw new Error(`_routes.json allows 100 rules, got ${include.length}`);
writeFileSync(join(out, "_routes.json"), JSON.stringify({ version: 1, include, exclude: [] }, null, 2));
console.log(`_routes.json: ${include.length} rules`);

// Page URL for an exported file: index.html -> /, earn/pools.html -> /earn/pools.
const pageUrl = (p) => {
  const r = "/" + relative(out, p).split(sep).join("/").replace(/\.html$/, "");
  return r === "/index" ? "/" : r.replace(/\/index$/, "");
};
const pages = html.map(pageUrl).sort();
const files = new Set();
for (const p of html)
  for (const m of readFileSync(p, "utf8").matchAll(/\/_next\/static\/[^"'\\ )]+?\.(?:js|css|woff2)/g)) files.add(m[0]);
const list = [...files].sort();
// Changes whenever a page or file does, so the worker knows when to save again.
const version = createHash("sha256").update(JSON.stringify([pages, list, html.map((p) => readFileSync(p))])).digest("hex").slice(0, 16);
writeFileSync(join(out, "sw-manifest.json"), JSON.stringify({ version, pages, files: list }));
console.log(`sw-manifest.json: ${pages.length} pages, ${list.length} files (${version})`);

// Node entrypoint: `npm run dev` (tsx --watch) / `npm start`.
// Cloudflare Workers use src/index.ts directly (exported Hono app) and must
// never bundle this file (it binds a TCP port via @hono/node-server).
import { readFileSync } from "node:fs";
import path from "node:path";
import app, { startWarmers } from "./index.js";
import { serve } from "@hono/node-server";

// Local env: services/api/.env.local provides DATABASE_URL etc. for dev.
// Loaded here (not only via --env-file) so tsx --watch respawns keep the
// same env. Real environment variables always win over file values.
try {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2].trim().replace(/\s+#.*$/, "");
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    )
      v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {
  /* no local env file — real env must provide DATABASE_URL etc. */
}

const PORT = Number(process.env.API_PORT) || 3002;

startWarmers();
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] up on :${info.port}`);
});

// Cloudflare Worker entry: the Hono app plus Cloudflare storage.
//   CACHE  KV namespace  -> @seidar/cache (replaces Redis)
//   DB     D1 database   -> db.ts (replaces Postgres)
// A cron trigger (wrangler.toml) runs the warmers once a minute; Node's setInterval loops
// (server.ts) never run here.
import { drainBackground, setCacheDriver } from "@seidar/cache";
import app, { runWarmersOnce } from "./index.js";
import { useD1, type D1Like } from "./db.js";

type Kv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
};
type Env = { CACHE?: Kv; DB?: D1Like };
type Ctx = { waitUntil(p: Promise<unknown>): void; passThroughOnException?(): void };

let bound = false;
function bind(env: Env): void {
  if (bound) return;
  bound = true;
  const kv = env.CACHE;
  if (kv)
    setCacheDriver({
      get: (k) => kv.get(k),
      // KV's shortest expiry is 60s; readers judge freshness by the stored timestamp anyway.
      put: (k, v, ttlMs) => kv.put(k, v, { expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)) }),
    });
  if (env.DB) useD1(env.DB);
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    bind(env);
    const res = await app.fetch(req, env as never, ctx as never);
    ctx.waitUntil(drainBackground());
    return res;
  },
  async scheduled(ev: { scheduledTime: number }, env: Env, ctx: Ctx): Promise<void> {
    bind(env);
    ctx.waitUntil(runWarmersOnce(new Date(ev.scheduledTime)).then(() => drainBackground()));
  },
};

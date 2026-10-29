// Cloudflare Worker entry: the Hono app plus Cloudflare storage.
//   CACHE  KV namespace  -> @seidar/cache, second tier (durable, shared by every location)
//   Cache API            -> @seidar/cache, first tier (free and unlimited, per location)
//   DB     D1 database   -> db.ts (replaces Postgres)
//   FEEDBACK_EMAIL       -> feedback.ts, Email Routing send binding (to the FEEDBACK_TO secret)
// A cron trigger (wrangler.toml) runs the warmers once a minute; Node's setInterval loops
// (server.ts) never run here.
import "./worker-compat.js";
import { EmailMessage } from "cloudflare:email";
import { drainBackground, setCacheDriver } from "@seidar/cache";
import { setFeedbackMailer } from "./feedback.js";
import app, { runWarmersOnce } from "./index.js";
import { useD1, type D1Like } from "./db.js";

type Kv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
};
type Env = { CACHE?: Kv; DB?: D1Like; FEEDBACK_EMAIL?: { send(m: EmailMessage): Promise<void> } };
type Ctx = { waitUntil(p: Promise<unknown>): void; passThroughOnException?(): void };
type EdgeCache = { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> };

/* KV writes are the metered resource (1k/day free, 1M/month paid), so KV is only the durable
   fallback. Keys rewritten every few seconds (spot prices, Zenex ticks, trade tapes) live in the
   location cache only; everything else reaches KV when its value changes, or every 10 minutes
   to refresh the stored timestamp. */
const EDGE_ONLY = ["prices:spot:", "zenex:tickers", "zenex:state:", "zenex:rates:", "zenex:vol24:", "zenex:udf:", "dextrades:"];
const KV_REFRESH_MS = 10 * 60_000;
const lastKv = new Map<string, { value: string; at: number }>();

const edge = (): EdgeCache | null => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
const edgeKey = (k: string) => `https://api.seidar.xyz/__cache/${encodeURIComponent(k)}`;
/** The value part of an @seidar/cache payload ({"at":…,"value":…}), for change detection. */
const valuePart = (payload: string) => payload.slice(payload.indexOf(',"value":') + 1);

let bound = false;
function bind(env: Env): void {
  if (bound) return;
  bound = true;
  const kv = env.CACHE;
  setCacheDriver({
    async get(k) {
      const hit = await edge()?.match(edgeKey(k)).catch(() => undefined);
      if (hit) return hit.text();
      return kv ? kv.get(k) : null;
    },
    async put(k, v, ttlMs) {
      const secs = Math.max(60, Math.ceil(ttlMs / 1000));
      await edge()
        ?.put(edgeKey(k), new Response(v, { headers: { "Cache-Control": `max-age=${secs}`, "Content-Type": "application/json" } }))
        .catch(() => {});
      if (!kv || EDGE_ONLY.some((p) => k.includes(p))) return;
      const value = valuePart(v);
      const prev = lastKv.get(k);
      if (prev && prev.value === value && Date.now() - prev.at < KV_REFRESH_MS) return;
      lastKv.set(k, { value, at: Date.now() });
      // KV's shortest expiry is 60s; readers judge freshness by the stored timestamp anyway.
      await kv.put(k, v, { expirationTtl: secs }).catch(() => lastKv.delete(k));
    },
  });
  if (env.DB) useD1(env.DB);
  const mail = env.FEEDBACK_EMAIL;
  if (mail) setFeedbackMailer((from, to, raw) => mail.send(new EmailMessage(from, to, raw)));
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

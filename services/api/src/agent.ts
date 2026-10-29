// Seidar Agent: a chat assistant over Seidar's own live data, backed by Claude.
// Read-only by construction: its tools are the API's GET routes (plus a swap quote), called
// in-process, so it can look things up and explain but never builds, signs or sends a transaction.
// Off unless ANTHROPIC_API_KEY is set; answers { ok: false, error: "agent-not-configured" } then.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_CHARS = 24_000;
const MAX_HISTORY = 30;
const MAX_MESSAGE_CHARS = 4_000;

/** Calls one of this API's own routes in-process and returns its parsed JSON body. */
export type RouteCaller = (path: string, init?: RequestInit) => Promise<unknown>;

type ChatTurn = { role: "user" | "assistant"; content: string };
type ChatBody = { messages?: ChatTurn[]; wallet?: string | null; wallets?: string[] };

const isAddress = (a: unknown): a is string => typeof a === "string" && /^[GC][A-Z2-7]{55}$/.test(a);
const isContract = (a: unknown): a is string => typeof a === "string" && /^C[A-Z2-7]{55}$/.test(a);

const SYSTEM = `You are Seidar Agent, the assistant inside Seidar: a non-custodial DeFi workspace for Stellar mainnet.
Seidar shows a user's wallets grouped into portfolios and lets them act across Stellar protocols:
- Swap: Soroswap aggregator routing over Soroswap, Aquarius, Phoenix, Sushi and the Stellar DEX.
- Perps: Zenex.
- Lend & Borrow: Blend (isolated pools) and XOXNO (positions are accounts with an id, on hubs and spokes).
- Pools: Soroswap, Aquarius, Phoenix, Sushi (including concentrated ranges).
- Vaults: DeFindex, Upshift, Sentora.
- Bridge: into Stellar only, via Allbridge Core over NEAR Intents.

How you work:
- Answer from live data. Use the tools to read balances, positions, markets, pools, vaults, prices and activity before stating numbers. Never invent figures, APYs, addresses or tokens; if a tool fails or returns nothing, say so plainly.
- You are read-only. You cannot build, sign or send transactions. When the user wants to act, tell them where in Seidar to do it (Dashboard, Trade > Swap or Perps, Earn > Lend & Borrow / Pools / Vaults, Bridge, History, Settings) and what to enter.
- Amounts from tools may be in base units (integers); convert with the token's decimals before showing them. Show USD values when available.
- Be concise and concrete. Use short paragraphs or bullet lists, and markdown bold for key figures. No tables wider than four columns.
- Risk: be clear about liquidation risk (health factor), impermanent loss, smart-contract risk and APY variability. Do not give personalised financial advice or promise returns; present options and trade-offs.
- Only discuss Stellar mainnet. Never mention other products by name as if Seidar were them.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_wallet_balances",
    description: "Token balances (with USD values where priced) held by one Stellar wallet.",
    input_schema: { type: "object", properties: { address: { type: "string", description: "Stellar account (G...) or contract (C...) address" } }, required: ["address"] },
  },
  {
    name: "get_lending_positions",
    description: "Blend and XOXNO lending positions of a wallet: supplied, borrowed, health factors, claimable rewards.",
    input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_vault_positions",
    description: "Vault deposits (DeFindex, Upshift, Sentora) of a wallet.",
    input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_liquidity_positions",
    description: "DEX liquidity (LP) positions of a wallet across Soroswap, Aquarius, Phoenix and Sushi.",
    input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_recent_activity",
    description: "Recent decoded transactions of a wallet (swaps, lending, vaults, liquidity, transfers).",
    input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_prices",
    description: "Live USD prices for token codes.",
    input_schema: { type: "object", properties: { codes: { type: "string", description: "Comma-separated token codes, e.g. XLM,USDC,AQUA" } }, required: ["codes"] },
  },
  {
    name: "list_lending_markets",
    description: "Every Blend and XOXNO lending market: asset, pool, supply/borrow APY, liquidity, utilisation, collateral factor.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_vaults",
    description: "Every listed vault (DeFindex, Upshift, Sentora): name, asset, TVL, APY, withdrawal terms.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_dex_pools",
    description: "Liquidity pools of one DEX with TVL, volume and APR where available.",
    input_schema: {
      type: "object",
      properties: { protocol: { type: "string", enum: ["soroswap", "aquarius", "phoenix", "sushi"] } },
      required: ["protocol"],
    },
  },
  {
    name: "list_swap_tokens",
    description: "Tokens Seidar can swap, with their contract ids and decimals. Use it to find contract ids before get_swap_quote.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_swap_quote",
    description: "Best swap route and expected output for an exact-in swap. Read-only: it does not create a transaction.",
    input_schema: {
      type: "object",
      properties: {
        asset_in: { type: "string", description: "Contract id (C...) of the token sold" },
        asset_out: { type: "string", description: "Contract id (C...) of the token bought" },
        amount: { type: "string", description: "Amount sold, as a base-unit integer string (amount x 10^decimals)" },
      },
      required: ["asset_in", "asset_out", "amount"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>, call: RouteCaller): Promise<{ text: string; error: boolean }> {
  const addr = () => {
    if (!isAddress(input.address)) throw new Error("address must be a Stellar G... or C... address");
    return encodeURIComponent(input.address);
  };
  let data: unknown;
  switch (name) {
    case "get_wallet_balances":
      data = await call(`/balances?address=${addr()}`);
      break;
    case "get_lending_positions":
      data = await call(`/positions?address=${addr()}`);
      break;
    case "get_vault_positions":
      data = await call(`/vaults/positions?address=${addr()}`);
      break;
    case "get_liquidity_positions":
      data = await call(`/dex/positions?address=${addr()}`);
      break;
    case "get_recent_activity":
      data = await call(`/activity?address=${addr()}&kind=all`);
      break;
    case "get_prices": {
      const codes = String(input.codes ?? "").replace(/[^A-Za-z0-9,]/g, "").slice(0, 200);
      if (!codes) throw new Error("codes is required");
      data = await call(`/prices?codes=${encodeURIComponent(codes)}`);
      break;
    }
    case "list_lending_markets":
      data = await call("/lend/markets");
      break;
    case "list_vaults":
      data = await call("/vaults");
      break;
    case "list_dex_pools": {
      const p = String(input.protocol ?? "");
      if (!["soroswap", "aquarius", "phoenix", "sushi"].includes(p)) throw new Error("unknown protocol");
      data = await call(`/dex/pools?protocol=${p}`);
      break;
    }
    case "list_swap_tokens":
      data = await call("/swap/tokens");
      break;
    case "get_swap_quote": {
      if (!isContract(input.asset_in) || !isContract(input.asset_out)) throw new Error("asset_in and asset_out must be contract ids");
      if (!/^\d+$/.test(String(input.amount ?? ""))) throw new Error("amount must be a base-unit integer string");
      data = await call("/swap/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetIn: input.asset_in, assetOut: input.asset_out, amount: String(input.amount), tradeType: "EXACT_IN" }),
      });
      break;
    }
    default:
      return { text: `Unknown tool: ${name}`, error: true };
  }
  let text = JSON.stringify(data);
  if (text.length > MAX_TOOL_CHARS) text = `${text.slice(0, MAX_TOOL_CHARS)}… [truncated: ${text.length} chars total]`;
  return { text, error: false };
}

const cleanHistory = (messages: unknown): ChatTurn[] => {
  if (!Array.isArray(messages)) return [];
  const turns = messages
    .filter((m): m is ChatTurn => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_HISTORY);
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
};

export async function agentChat(body: ChatBody, call: RouteCaller) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 200, body: { ok: false, error: "agent-not-configured" } };
  const history = cleanHistory(body?.messages);
  if (!history.length || history[history.length - 1].role !== "user") return { status: 400, body: { ok: false, error: "last message must be from the user" } };

  const wallet = isAddress(body?.wallet) ? body.wallet : null;
  const wallets = (Array.isArray(body?.wallets) ? body.wallets : []).filter(isAddress).slice(0, 20);
  const context = wallets.length
    ? `The user's active wallet is ${wallet ?? wallets[0]}. Wallets in their active portfolio: ${wallets.join(", ")}. Use these addresses when they ask about "my" balances or positions.`
    : wallet
      ? `The user's active wallet is ${wallet}.`
      : "The user has no wallet connected.";

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const used: string[] = [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: `${context} Today is ${new Date().toISOString().slice(0, 10)}.` },
        ],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return { status: 200, body: { ok: true, reply: "I can't help with that one. Try asking about your portfolio, positions or Stellar markets.", tools: used } };
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !toolUses.length || round === MAX_TOOL_ROUNDS) {
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n")
          .trim();
        const cut = response.stop_reason === "max_tokens" ? "\n\n_(Answer cut short. Ask me to continue.)_" : "";
        return { status: 200, body: { ok: true, reply: (reply || "I couldn't put an answer together. Please try rephrasing.") + cut, tools: used } };
      }

      messages.push({ role: "assistant", content: response.content });
      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          used.push(t.name);
          try {
            const r = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>, call);
            return { type: "tool_result", tool_use_id: t.id, content: r.text, is_error: r.error };
          } catch (e) {
            return { type: "tool_result", tool_use_id: t.id, content: `Error: ${(e as Error).message}`, is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return { status: 200, body: { ok: false, error: "The agent took too many steps. Please try a narrower question." } };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { status: 200, body: { ok: false, error: "The agent's API key was rejected." } };
    if (e instanceof Anthropic.RateLimitError) return { status: 200, body: { ok: false, error: "The agent is busy right now. Try again in a minute." } };
    if (e instanceof Anthropic.APIError) return { status: 200, body: { ok: false, error: `The agent service returned an error (${e.status ?? "network"}).` } };
    return { status: 200, body: { ok: false, error: "The agent is unavailable right now." } };
  }
}

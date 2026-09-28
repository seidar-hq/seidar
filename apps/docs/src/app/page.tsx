export default function DocsHome() {
  return (
    <main className="docs-wrap">
      <h1>Seidar Docs</h1>
      <p>
        Manage, leverage and automate Blend, XOXNO and Peridot positions on
        Stellar. Start with Users, go deep in Protocol, integrate via SDK.
      </p>
      <nav className="docs-nav">
        <a href="#users">Users</a>
        <a href="#protocol">Protocol</a>
        <a href="#sdk">SDK</a>
        <a href="#api">API</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>

      <h2 id="users">Users</h2>
      <p>
        Connect Freighter for manual supply, borrow and swaps. Create a
        passkey smart account to unlock Boost/Repay, Shifter, Savings and
        Automation. Automation needs a scoped keeper key (24h, spending
        limit); multisig (2-of-3 or weighted) is optional in Settings.
      </p>
      <ul>
        <li>Boost/Repay preview shows flash amount, 25bps service fee and resulting health before signing.</li>
        <li>Gas credits cover your first actions; when empty you pay in USDC via the relayer or XLM directly.</li>
        <li>Simulation runs on testnet — never mainnet funds until health math is confirmed.</li>
      </ul>

      <h2 id="protocol">Protocol</h2>
      <p>
        One Soroban invocation executes a whole recipe atomically; any panic
        reverts everything. No <code>delegatecall</code> exists on Soroban —
        batching lives in <code>recipe_executor</code>, not in the wallet.
      </p>
      <pre><code>{`user.require_auth()
  -> recipe_executor.execute_recipe(recipe)
    -> adapters: blend / xoxno / peridot + soroswap / aqua / phoenix
    -> flash_receiver.exec_op (Blend submit callback)
keeper -> guardian.execute (re-checks trigger on-chain)`}</code></pre>
      <ul>
        <li><code>contracts/recipe_executor</code> — validates order (flash first, single), reentrancy guard, events.</li>
        <li><code>contracts/guardian</code> — persistent subs, cooldowns, one-shot fire, unauthorized/false-trigger rejection.</li>
        <li><code>contracts/adapters</code> — pinned LTV caps (Blend 7500, XOXNO 8000, Peridot 7000).</li>
        <li><code>contracts/configs/networks.json</code> — pool/oracle pins; CI fails on drift.</li>
      </ul>

      <h2 id="sdk">SDK</h2>
      <pre><code>{`import { Recipe, boostRecipe, quoteFee, feeTierBps } from "@seidar/sdk";
import { healthBps, aggregatePortfolio } from "@seidar/positions-sdk";
import { evaluateRule } from "@seidar/automation-sdk";

const recipe = boostRecipe({ debtAsset: "USDC", collateralAsset: "XLM",
  flashAmount: 2000, supplyAmount: 2000, borrowAmount: 2000 });
recipe.validate();
const intent = recipe.buildIntent("GABC..."); // unsigned, execution-ordered
const fee = quoteFee(2000, feeTierBps({})); // 25bps uncorrelated
const decision = evaluateRule(rule, { healthBps: 13500, price: 0 }, 10000);
// -> { fire: true, reason: "fire" }`}</code></pre>

      <h2 id="api">API</h2>
      <p>
        Keeper, credits and indexer live in <code>services/</code>. The MCP
        server in <code>mcp/</code> exposes read + quote + build tools and
        returns unsigned intents only — agents never custody keys.
      </p>
    </main>
  );
}

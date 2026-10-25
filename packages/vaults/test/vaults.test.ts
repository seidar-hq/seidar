import test from "node:test";
import assert from "node:assert/strict";
import {
  annualizePps,
  apyFromSeries,
  paginate,
  filterVaults,
  sortVaults,
  apyDropAlert,
  normalizeDefindex,
  baseToTokens,
  pickVaultCandidate,
  extractExplorerVaults,
  shortVaultName,
  type VaultRow,
} from "../src/index.js";

const DAY = 86400_000;

test("annualizePps matches live DeFindex numbers", () => {
  // BeansUsdcVault: PPS 0.9875114963 -> 0.9921001407 over 30d ≈ 5.7%.
  const apy = annualizePps(0.9875114963284499, 0.9921001407475295, 30);
  assert.ok(apy != null && Math.abs(apy - 5.7) < 0.15, `got ${apy}`);
  // Flat price -> 0.
  assert.equal(annualizePps(1, 1, 7), 0);
});

test("annualizePps refuses degenerate inputs", () => {
  assert.equal(annualizePps(0, 1, 7), null);
  assert.equal(annualizePps(1, 0, 7), null);
  assert.equal(annualizePps(1, 1, 0), null);
  assert.equal(annualizePps(-1, 1, 7), null);
  assert.equal(annualizePps(NaN, 1, 7), null);
  assert.equal(annualizePps(1, Infinity, 7), null);
});

test("apyFromSeries uses the trailing window only", () => {
  const now = Date.now();
  const pts = [
    { t: now - 30 * DAY, pps: 1.0 },
    { t: now - 10 * DAY, pps: 1.0 },
    { t: now - 7 * DAY, pps: 1.0 },
    { t: now, pps: 1.0 + 0.07 / 365.25 * 7 }, // ~7% pace over 7d
  ];
  const apy = apyFromSeries(pts, 7, now);
  assert.ok(apy != null && Math.abs(apy - 7) < 0.5, `got ${apy}`);
  // Too few points / too short a window -> null.
  assert.equal(apyFromSeries([{ t: now, pps: 1 }], 7, now), null);
  assert.equal(
    apyFromSeries(
      [
        { t: now - 3600_000, pps: 1 },
        { t: now, pps: 1.01 },
      ],
      7,
      now,
    ),
    null,
  );
});

function row(over: Partial<VaultRow> = {}): VaultRow {
  return {
    protocol: "defindex",
    address: "CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3",
    name: "x",
    symbol: "X",
    asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    assetCode: "USDC",
    assetDecimals: 7,
    tvlUsd: 100,
    apyPct: 5,
    apySource: "advertised",
    liquidityUsd: 90,
    updatedAt: 0,
    ...over,
  };
}

test("paginate clamps bounds", () => {
  const rows = Array.from({ length: 45 }, (_, i) => row({ name: `v${i}` }));
  const p1 = paginate(rows, 1, 20);
  assert.equal(p1.rows.length, 20);
  assert.equal(p1.totalPages, 3);
  const p3 = paginate(rows, 9, 20);
  assert.equal(p3.page, 3);
  assert.equal(p3.rows.length, 5);
  assert.equal(paginate(rows, 0, 0).perPage, 20);
  assert.equal(paginate(rows, 1, 500).perPage, 100);
  assert.deepEqual(paginate([], 1, 20).rows, []);
});

test("filterVaults applies protocol/token/tvl gates", () => {
  const rows = [
    row({ protocol: "defindex", assetCode: "USDC", tvlUsd: 50 }),
    row({ protocol: "upshift", assetCode: "XLM", tvlUsd: 5000 }),
    row({ protocol: "untangled", assetCode: "USDC", tvlUsd: 5, apyPct: 0 }),
  ];
  assert.equal(filterVaults(rows, { protocols: ["upshift"] }).length, 1);
  assert.equal(
    filterVaults(rows, { tokens: ["usdc"] }).length,
    2,
  );
  assert.equal(filterVaults(rows, { minTvlUsd: 100 }).length, 1);
  assert.equal(filterVaults(rows, { hideZeroApy: true }).length, 2);
  assert.equal(filterVaults(rows, {}).length, 3);
});

test("sortVaults sinks nulls and orders both ways", () => {
  const rows = [
    row({ name: "b", apyPct: 3 }),
    row({ name: "a", apyPct: null }),
    row({ name: "c", apyPct: 9 }),
  ];
  assert.deepEqual(
    sortVaults(rows, "apy", "desc").map((r) => r.name),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    sortVaults(rows, "apy", "asc").map((r) => r.name),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    sortVaults(rows, "name", "asc").map((r) => r.name),
    ["a", "b", "c"],
  );
  const mixed = [
    row({ protocol: "upshift", name: "z", assetCode: "XLM" }),
    row({ protocol: "defindex", name: "a", assetCode: "USDC" }),
  ];
  assert.deepEqual(
    sortVaults(mixed, "protocol", "asc").map((r) => r.protocol),
    ["defindex", "upshift"],
  );
  assert.deepEqual(
    sortVaults(mixed, "token", "asc").map((r) => r.assetCode),
    ["USDC", "XLM"],
  );
});

test("apyDropAlert needs known values and a real drop", () => {
  assert.equal(apyDropAlert(10, 7, 2), true);
  assert.equal(apyDropAlert(10, 9.5, 2), false);
  assert.equal(apyDropAlert(null, 7, 2), false);
  assert.equal(apyDropAlert(10, null, 2), false);
  assert.equal(apyDropAlert(7, 10, 2), false);
  assert.equal(apyDropAlert(10, 7, 0), false);
});

test("baseToTokens scales display amounts", () => {
  assert.equal(baseToTokens("5686214652723", 7), 568621.4652723);
  assert.equal(baseToTokens("junk", 7), 0);
});

test("normalizeDefindex maps live discover rows", () => {
  const codeOf = (c: string) =>
    c === "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
      ? "USDC"
      : null;
  const rows = normalizeDefindex(
    [
      {
        address: "CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3",
        totalManagedFunds: [
          {
            asset:
              "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
            total_amount: "5686214652723",
          },
        ],
        apy: 5.38,
      },
      { address: "GARBAGE", totalManagedFunds: [], apy: 1 },
      {
        address: "CC24OISYJHWXZIFZBRJHFLVO5CNN3PQSKZE5BBBZLSSI5Z23TKC6GQY2",
        totalManagedFunds: [
          { asset: "CAL6ER2TI6CTRAY6BFXWNWA7WTYXUXTQCHUBCIBU5O6KM3HJFG6Z6VXV", total_amount: "10" },
        ],
        apy: 0,
      },
    ],
    codeOf,
    (c) => (c === "USDC" ? 1 : 0),
    () => 7,
    123,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].assetCode, "USDC");
  assert.equal(rows[0].tvlUsd, 568621.4652723);
  assert.equal(rows[0].apyPct, 5.38);
  assert.ok(rows[1].assetCode.startsWith("UNKNOWN-"));
  assert.equal(rows[1].tvlUsd, 0);
});

test("pickVaultCandidate filters tx-meta contracts", () => {
  const vault = "CB3FUMFGCF6DHSFK6N2TOKHRMYXS34HFKQR45UKVORCRUM35AF3ES7WQ";
  const factory = "CDKFHFJIET3A73A2YN4KV7NSV32S6YGQMUFH3DNJXLBWL4SKEGVRNFKI";
  assert.equal(pickVaultCandidate([factory, vault], [factory]), vault);
  assert.equal(pickVaultCandidate([factory], [factory]), null);
  assert.equal(pickVaultCandidate(["junk", "GABC"], [factory]), null);
  assert.equal(pickVaultCandidate([], []), null);
});

test("extractExplorerVaults parses asset search payloads", () => {  const payload = {
    _embedded: {
      records: [
        { code: "neko_usdc", contract: "CCUZC3HC5TH2VCYZFUG57E6IGKPL45YUN2SI3UEYQUBA7RCYHUIZBSFV" },
        { code: "XLM" },
        { code: "junk", contract: "SHORT" },
        { code: "dup", contract: "CCUZC3HC5TH2VCYZFUG57E6IGKPL45YUN2SI3UEYQUBA7RCYHUIZBSFV" },
      ],
    },
  };
  assert.deepEqual(extractExplorerVaults(payload), [
    "CCUZC3HC5TH2VCYZFUG57E6IGKPL45YUN2SI3UEYQUBA7RCYHUIZBSFV",
  ]);
  assert.deepEqual(extractExplorerVaults({}), []);
  assert.deepEqual(extractExplorerVaults(null), []);
});

test("shortVaultName strips only the factory prefix", () => {
  assert.equal(shortVaultName("DeFindex-Vault-Neko EURC"), "Neko EURC");
  assert.equal(
    shortVaultName("DeFindex-Vault-6OSrR6n8DpJPIF7riur"),
    "6OSrR6n8DpJPIF7riur",
  );
  assert.equal(shortVaultName("Gami earnUSDC"), "Gami earnUSDC");
  assert.equal(shortVaultName("DeFindex-Vault-"), "DeFindex-Vault-");
  assert.equal(shortVaultName(""), "");
});

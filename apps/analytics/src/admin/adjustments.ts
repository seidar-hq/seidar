// Owner-only overlays applied by the API on top of the measured analytics summary.
// The measured base keeps updating from real transactions; these values only scale/offset it.

export type Adjustments = {
  enabled: boolean;
  volumeX: number;
  volumeAdd: number;
  txX: number;
  txAdd: number;
  walletX: number;
  walletAdd: number;
  transactingShare: number;
  active30Share: number;
  active7Share: number;
  active1Share: number;
  historyDays: number;
  growth: number;
  jitter: number;
  kindMix: Record<string, number>;
  protocolMix: Record<string, number>;
  recentRows: number;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  enabled: true,
  volumeX: 1,
  volumeAdd: 0,
  txX: 1,
  txAdd: 0,
  walletX: 1,
  walletAdd: 0,
  transactingShare: 0.45,
  active30Share: 0.35,
  active7Share: 0.18,
  active1Share: 0.06,
  historyDays: 60,
  growth: 1.6,
  jitter: 0.35,
  kindMix: { swap: 40, lending: 22, vault: 14, liquidity: 10, perps: 8, claim: 3, send: 2, trustline: 1 },
  protocolMix: { soroswap: 30, blend: 18, aquarius: 8, phoenix: 4, xoxno: 6, defindex: 9, upshift: 4, sentora: 3, zenex: 8, sushi: 2, stellar: 3 },
  recentRows: 25,
};

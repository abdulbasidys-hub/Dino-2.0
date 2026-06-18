// Central place to edit branding / on-chain details for the project.
export const SITE_CONFIG = {
  tokenName: "DINO",
  tokenTicker: "$DINO",
  // Contract address — replace with the real deployed mint address
  contractAddress: "13SVgpzFcZf8vF6Tg1QV7vec82FdJrf4Kg2VEX4xpump",
  // Percentage of the pot taken by the team. The remaining 80% is what's
  // available for round winners. The team's cut is silently sent to a
  // second wallet by the backend (see server/server.js) and is never
  // shown on the frontend.
  potSharePercent: 80,
  solscanBase: "https://solscan.io",

  // ── Round payout amounts ──────────────────────────────────────
  // These are FIXED amounts paid to round winners when the pot can
  // afford them. If the distributable 80% of the pot is below the sum
  // of these three, the backend falls back to splitting whatever is
  // available as 50/30/20 instead. The frontend only uses these for
  // display copy — the backend (server/server.js) is the source of
  // truth for actual transfers.
  fixedFirstSol: 1,
  fixedSecondSol: 0.5,
  fixedThirdSol: 0.3,

  // Flat reward paid to the single winner of the Hall of Fame /
  // Winners Board each round, once it's unlocked.
  winnersBoardRewardSol: 0.5,
  // Number of all-time #1 round winners required before the Winners
  // Board starts paying out (it can still be played before that).
  winnersBoardUnlockCount: 5,

  // ── Token holding gate ─────────────────────────────────────────
  // Your Railway backend URL — used by the frontend to call /api/verify-wallet.
  // Replace this with your actual Railway service URL.
  backendUrl: "dino-20-production.up.railway.app",

  // Minimum token amount a wallet must hold to register and compete.
  // Checked as a raw balance (no price feed) — simpler and more reliable.
  minTokenAmount: 200_000,

  // Public, read-only Solana RPC endpoint used by the FRONTEND to
  // check token balances. This is visible to anyone using the site,
  // so do not put a private/paid RPC key with write access here.
  // The public default below is rate-limited — for production traffic
  // swap this for a free-tier endpoint from Helius, QuickNode, etc.
  publicRpcUrl: "https://api.mainnet-beta.solana.com",
};

export const solscanAddress = (address) =>
  `${SITE_CONFIG.solscanBase}/account/${address}`;

export const solscanTx = (sig) => `${SITE_CONFIG.solscanBase}/tx/${sig}`;

export const shortenAddress = (address, chars = 4) => {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};
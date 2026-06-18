// Checks whether a wallet currently holds at least SITE_CONFIG.minHoldingSol
// worth of $DINO. Used at registration time and again every time a game
// ends, since holding must be ongoing — selling after registering should
// disqualify future scores, not just the initial signup.
//
// IMPORTANT: this is a client-side check for UX purposes only. It can be
// bypassed by a sufficiently determined user (e.g. editing the JS in dev
// tools). The actual money is protected by an identical check run again
// on the BACKEND immediately before any payout (see server/server.js) —
// that is the real security boundary, not this file.

import { Connection, PublicKey } from "@solana/web3.js";
import { SITE_CONFIG } from "./config";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex/tokens/";

let connection = null;
function getConnection() {
  if (!connection) {
    connection = new Connection(SITE_CONFIG.publicRpcUrl, "confirmed");
  }
  return connection;
}

/**
 * Fetches the current price of $DINO in SOL via DexScreener.
 * Throws if no SOL-quoted pair is found (e.g. token too new/illiquid
 * to be indexed yet).
 */
async function getTokenPriceInSol() {
  const res = await fetch(DEXSCREENER_URL + SITE_CONFIG.contractAddress);
  if (!res.ok) throw new Error("Price lookup failed");
  const data = await res.json();
  const pairs = data?.pairs || [];
  const solPair = pairs.find(
    (p) => p.quoteToken?.address === WSOL_MINT || p.quoteToken?.symbol === "SOL"
  );
  if (!solPair) throw new Error("No SOL-quoted trading pair found yet");
  const price = parseFloat(solPair.priceNative);
  if (!price || price <= 0) throw new Error("Invalid price data");
  return price;
}

/**
 * Sums the wallet's $DINO balance across any token accounts it holds
 * for this mint (normally just one).
 */
async function getTokenBalance(walletAddress) {
  const owner = new PublicKey(walletAddress);
  const mint = new PublicKey(SITE_CONFIG.contractAddress);
  const resp = await getConnection().getParsedTokenAccountsByOwner(owner, { mint });
  if (resp.value.length === 0) return 0;
  return resp.value.reduce(
    (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount || 0),
    0
  );
}

/**
 * Returns { qualifies, valueInSol, balance, priceInSol, error }.
 * On any failure (bad wallet, RPC issue, no price data), qualifies is
 * false — this fails CLOSED, meaning we block rather than silently
 * allow when we can't verify. If your token is brand new and not yet
 * indexed by DexScreener, this will block everyone until it is.
 */
export async function checkTokenHolding(walletAddress) {
  if (!walletAddress) {
    return { qualifies: false, valueInSol: 0, balance: 0, priceInSol: 0, error: "No wallet provided" };
  }
  try {
    const [balance, priceInSol] = await Promise.all([
      getTokenBalance(walletAddress),
      getTokenPriceInSol(),
    ]);
    const valueInSol = balance * priceInSol;
    return {
      qualifies: valueInSol >= SITE_CONFIG.minHoldingSol,
      valueInSol,
      balance,
      priceInSol,
      error: null,
    };
  } catch (e) {
    return { qualifies: false, valueInSol: 0, balance: 0, priceInSol: 0, error: e.message };
  }
}

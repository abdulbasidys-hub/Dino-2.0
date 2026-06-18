// Checks whether a wallet currently holds at least MIN_TOKEN_AMOUNT
// of the token. No price feed needed — just a raw SPL balance check.
//
// IMPORTANT: this is a client-side check for UX only. The real
// enforcement is the identical check in server/server.js, which runs
// immediately before any payout is sent.

import { Connection, PublicKey } from "@solana/web3.js";
import { SITE_CONFIG } from "./config";

const MIN_TOKEN_AMOUNT = 200_000;

let connection = null;
function getConnection() {
  if (!connection) {
    connection = new Connection(SITE_CONFIG.publicRpcUrl, "confirmed");
  }
  return connection;
}

async function getTokenBalance(walletAddress) {
  const owner = new PublicKey(walletAddress);
  const mint  = new PublicKey(SITE_CONFIG.contractAddress);
  const resp  = await getConnection().getParsedTokenAccountsByOwner(owner, { mint });
  if (resp.value.length === 0) return 0;
  return resp.value.reduce(
    (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount || 0),
    0
  );
}

/**
 * Returns { qualifies, balance, error }.
 * qualifies = true if balance >= 200,000 tokens.
 */
export async function checkTokenHolding(walletAddress) {
  if (!walletAddress) {
    return { qualifies: false, balance: 0, error: "No wallet provided" };
  }
  try {
    const balance = await getTokenBalance(walletAddress);
    return {
      qualifies: balance >= MIN_TOKEN_AMOUNT,
      balance,
      error: null,
    };
  } catch (e) {
    return { qualifies: false, balance: 0, error: e.message };
  }
}
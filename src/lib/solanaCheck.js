// Calls our own Railway backend to verify a wallet's token holding.
// The backend does the actual Solana RPC call server-side, so the
// browser never touches Solana directly — no CORS issues, no rate limits.

import { SITE_CONFIG } from "./config";

export async function checkTokenHolding(walletAddress) {
  if (!walletAddress) {
    return { qualifies: false, balance: 0, error: "No wallet provided" };
  }
  try {
    const url = `${SITE_CONFIG.backendUrl}/api/verify-wallet?wallet=${encodeURIComponent(walletAddress)}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      return { qualifies: false, balance: 0, error: data.error || "Verification failed" };
    }
    // backend returns { qualifies, balance }
    return {
      qualifies: !!data.qualifies,
      balance:   data.balance || 0,
      error:     null,
    };
  } catch (e) {
    return { qualifies: false, balance: 0, error: e.message };
  }
}
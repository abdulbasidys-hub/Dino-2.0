/**
 * 1 SOL and a Dream — Fee Claimer
 * Monitors pump.fun bonding curve and PumpSwap vault for accumulated fees.
 * Exports startAutoClaimFees(connection, creatorKP, log)
 * Called from server.js on boot — no extra env vars needed beyond TOKEN_CA.
 */

const { PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const WSOL_MINT    = new PublicKey("So11111111111111111111111111111111111111112");

const SPL_TOKEN    = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM  = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bVd");

const CLAIM_INTERVAL = 20_000; // check every 20 seconds
const MIN_CLAIM_SOL  = 0.01;

function deriveATA(owner, mint) {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM
  );
  return addr;
}

function deriveBondingCurve(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM
  );
  return pda;
}

async function startAutoClaimFees(connection, creatorKP, log) {
  try {
    const TOKEN_CA = process.env.TOKEN_CA;
    if (!TOKEN_CA) { log("[claimFees] No TOKEN_CA — skipping fee claimer"); return; }

    const mintPub       = new PublicKey(TOKEN_CA);
    const bondingCurve  = deriveBondingCurve(mintPub);
    const pumpSwapVault = deriveATA(bondingCurve, WSOL_MINT);

    log(`[claimFees] Monitoring pump.fun vault: ${bondingCurve.toString().slice(0, 12)}...`);
    log(`[claimFees] Monitoring PumpSwap WSOL:  ${pumpSwapVault.toString().slice(0, 12)}...`);

    async function checkAndClaim() {
      try {
        // Pre-graduation: native SOL on the bonding curve
        const balLam = await connection.getBalance(bondingCurve);
        if (balLam > MIN_CLAIM_SOL * LAMPORTS_PER_SOL) {
          log(`[claimFees] pump.fun balance: ${(balLam / LAMPORTS_PER_SOL).toFixed(4)} SOL — fees accumulating`);
        }

        // Post-graduation: WSOL in PumpSwap vault
        try {
          const wsolBal = await connection.getTokenAccountBalance(pumpSwapVault);
          const wsolAmt = parseFloat(wsolBal.value.uiAmount || 0);
          if (wsolAmt > MIN_CLAIM_SOL) {
            log(`[claimFees] PumpSwap WSOL: ${wsolAmt.toFixed(4)} SOL — fees accumulating`);
          }
        } catch {}

      } catch (e) {
        if (!e.message?.includes("could not find account")) {
          log(`[claimFees] check error: ${e.message}`);
        }
      }
    }

    checkAndClaim();
    setInterval(checkAndClaim, CLAIM_INTERVAL);

  } catch (e) {
    // Never crash the server — claimFees is monitoring only
    log(`[claimFees] Failed to start: ${e.message}`);
  }
}

module.exports = { startAutoClaimFees };
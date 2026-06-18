/**
 * DINO — Payout Backend (Fixed-amount rounds + Hall of Fame)
 * --------------------------------------------------------------
 * Deploy this to Railway.
 *
 * RULES IMPLEMENTED:
 *
 *  1. TOKEN-HOLDING GATE
 *     A wallet must CURRENTLY hold at least MIN_HOLDING_SOL worth of
 *     the token (checked live via a DexScreener price lookup + an
 *     on-chain SPL balance read) for its score to count toward any
 *     payout. This is re-verified here, server-side, immediately
 *     before paying anyone — never trust the client-side check alone,
 *     since that can be bypassed. If a ranked candidate fails this
 *     check, the next qualifying candidate is promoted to fill that
 *     rank instead (a non-holder's score is treated as if it were
 *     never posted).
 *
 *  2. ROUND PAYOUT MATH (every ROUND_DURATION_MS)
 *     - P = the pot wallet's real on-chain balance.
 *     - Team takes 20% of P, ALWAYS, before anything else. This is
 *       not part of any other calculation below.
 *     - D = the remaining 80% of P — the budget for this round's
 *       winners.
 *     - If D >= FIXED_FIRST_SOL + FIXED_SECOND_SOL + FIXED_THIRD_SOL:
 *       pay those fixed amounts to whichever ranks have a qualifying
 *       (holding-verified) winner. Unfilled ranks simply aren't paid
 *       — that money stays in the wallet and rolls into next round.
 *     - Otherwise: fall back to splitting D itself as 50/30/20 among
 *       whichever ranks have a qualifying winner (same rollover rule).
 *     - Whatever's left after that MAY fund a Hall of Fame payout
 *       (see below) if there's enough and it's unlocked. Anything
 *       still left simply remains in the pot wallet — there's no
 *       artificial "reset to zero," the real balance is the truth.
 *
 *  3. HALL OF FAME / WINNERS BOARD
 *     - Only the outright #1 winner of a regular round is inducted —
 *       2nd and 3rd place get paid but stay in the general pool.
 *     - Once inducted, a player's future scores go to a separate
 *       Firestore pool (winnersBoardScores, written by the frontend)
 *       and they no longer appear on the general leaderboard.
 *     - The board is payout-locked until WINNERS_BOARD_UNLOCK_COUNT
 *       players have ever been inducted (one per round, by
 *       definition, so this takes at minimum that many rounds).
 *     - Once unlocked, each round pays exactly one Hall of Fame
 *       member — whoever scored highest in that pool this round —
 *       WINNERS_BOARD_REWARD_SOL, drawn from whatever's left of D
 *       after the regular round payout. If there isn't enough left,
 *       this round's Hall of Fame payout is simply skipped.
 *
 *  4. LEADERBOARD RESET
 *     The frontend resets everyone's competitive score to 0 each
 *     round (roundScores / winnersBoardScores are keyed per-round).
 *     This backend doesn't need to do anything extra for that beyond
 *     always querying by the CURRENT roundId.
 *
 * Required environment variables (Railway):
 *  - FIREBASE_SERVICE_ACCOUNT   -> full JSON (single-line string) of a
 *                                  Firebase service account key
 *  - SOLANA_RPC_URL             -> e.g. https://api.mainnet-beta.solana.com
 *  - POT_WALLET_PRIVATE_KEY     -> base58 secret key of the pot wallet
 *  - POT_WALLET_ADDRESS         -> public address of the pot wallet
 *  - FEE_WALLET_ADDRESS         -> team wallet, receives 20% of the
 *                                  pot every round, unconditionally
 *  - TOKEN_CA                   -> your token's mint address (used for
 *                                  both the holding check and claimFees)
 *  - MIN_HOLDING_SOL            -> optional, default 0.2
 *  - FIXED_FIRST_SOL            -> optional, default 1
 *  - FIXED_SECOND_SOL           -> optional, default 0.5
 *  - FIXED_THIRD_SOL            -> optional, default 0.3
 *  - WINNERS_BOARD_REWARD_SOL   -> optional, default 0.5
 *  - WINNERS_BOARD_UNLOCK_COUNT -> optional, default 5
 *  - ROUND_DURATION_MS          -> optional, default 900000 (15 minutes)
 *  - POLL_INTERVAL_MS           -> optional, default 15000 (15s)
 *  - MIN_PAYOUT_SOL             -> optional, default 0.01 — below this,
 *                                  a round still ends/restarts but no
 *                                  transfer is attempted
 *  - PORT                       -> optional, default 3000
 */

import "dotenv/config";
import express from "express";
import admin from "firebase-admin";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { startAutoClaimFees } = require("./lib/claimFees.js");

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------
const {
  FIREBASE_SERVICE_ACCOUNT,
  SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com",
  POT_WALLET_PRIVATE_KEY,
  POT_WALLET_ADDRESS,
  FEE_WALLET_ADDRESS,
  TOKEN_CA,
  MIN_HOLDING_SOL = "0.2",
  FIXED_FIRST_SOL = "1",
  FIXED_SECOND_SOL = "0.5",
  FIXED_THIRD_SOL = "0.3",
  WINNERS_BOARD_REWARD_SOL = "0.5",
  WINNERS_BOARD_UNLOCK_COUNT = "5",
  ROUND_DURATION_MS = String(15 * 60 * 1000),
  POLL_INTERVAL_MS = "15000",
  MIN_PAYOUT_SOL = "0.01",
  PORT = "3000",
} = process.env;

const ROUND_MS = Number(ROUND_DURATION_MS);
const MIN_PAYOUT_LAMPORTS = Math.floor(Number(MIN_PAYOUT_SOL) * LAMPORTS_PER_SOL);
const FIXED_LAMPORTS = [
  Math.floor(Number(FIXED_FIRST_SOL) * LAMPORTS_PER_SOL),
  Math.floor(Number(FIXED_SECOND_SOL) * LAMPORTS_PER_SOL),
  Math.floor(Number(FIXED_THIRD_SOL) * LAMPORTS_PER_SOL),
];
const FIXED_TOTAL_LAMPORTS = FIXED_LAMPORTS.reduce((a, b) => a + b, 0);
const FALLBACK_SHARES = [0.5, 0.3, 0.2]; // used only when the pot can't afford the fixed amounts
const WB_REWARD_LAMPORTS = Math.floor(Number(WINNERS_BOARD_REWARD_SOL) * LAMPORTS_PER_SOL);
const WB_UNLOCK_COUNT = Number(WINNERS_BOARD_UNLOCK_COUNT);
const MIN_HOLDING_SOL_NUM = Number(MIN_HOLDING_SOL);

if (!FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
}
if (!POT_WALLET_PRIVATE_KEY || !POT_WALLET_ADDRESS || !FEE_WALLET_ADDRESS) {
  throw new Error(
    "Missing one of POT_WALLET_PRIVATE_KEY / POT_WALLET_ADDRESS / FEE_WALLET_ADDRESS"
  );
}
if (!TOKEN_CA) {
  throw new Error("Missing TOKEN_CA env var — required for the holding check");
}

// ----------------------------------------------------------------
// Firebase Admin
// ----------------------------------------------------------------
const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ----------------------------------------------------------------
// Solana
// ----------------------------------------------------------------
const connection = new Connection(SOLANA_RPC_URL, "confirmed");
const potKeypair = Keypair.fromSecretKey(bs58.decode(POT_WALLET_PRIVATE_KEY));
const potPublicKey = new PublicKey(POT_WALLET_ADDRESS);
const feePublicKey = new PublicKey(FEE_WALLET_ADDRESS);
const tokenMint = new PublicKey(TOKEN_CA);

if (potKeypair.publicKey.toBase58() !== potPublicKey.toBase58()) {
  throw new Error("POT_WALLET_PRIVATE_KEY does not match POT_WALLET_ADDRESS");
}

// ----------------------------------------------------------------
// Pot balance helpers
// ----------------------------------------------------------------
let lastKnownLamports = null;

async function getPotBalanceLamports() {
  return connection.getBalance(potPublicKey);
}

async function updatePotDisplay() {
  const lamports = await getPotBalanceLamports();
  const totalSol = lamports / LAMPORTS_PER_SOL;

  if (lastKnownLamports !== null && lamports > lastKnownLamports) {
    const gained = (lamports - lastKnownLamports) / LAMPORTS_PER_SOL;
    console.log(`[inflow] Pot wallet balance increased by ${gained.toFixed(4)} SOL (creator rewards landed).`);
  }
  lastKnownLamports = lamports;

  await db.collection("config").doc("pot").set(
    { totalSol, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { lamports, totalSol };
}

async function sendPayout(destination, amountLamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: potKeypair.publicKey,
      toPubkey: new PublicKey(destination),
      lamports: amountLamports,
    })
  );
  return sendAndConfirmTransaction(connection, tx, [potKeypair]);
}

// ----------------------------------------------------------------
// Token-holding verification (server-side, authoritative)
// ----------------------------------------------------------------
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex/tokens/";

async function getTokenPriceInSol() {
  const res = await fetch(DEXSCREENER_URL + TOKEN_CA);
  if (!res.ok) throw new Error("price fetch failed");
  const data = await res.json();
  const pairs = data?.pairs || [];
  const solPair = pairs.find(
    (p) => p.quoteToken?.address === WSOL_MINT || p.quoteToken?.symbol === "SOL"
  );
  if (!solPair) throw new Error("no SOL-quoted pair found");
  const price = parseFloat(solPair.priceNative);
  if (!price || price <= 0) throw new Error("invalid price data");
  return price;
}

async function getTokenBalance(walletAddress) {
  const owner = new PublicKey(walletAddress);
  const resp = await connection.getParsedTokenAccountsByOwner(owner, { mint: tokenMint });
  if (resp.value.length === 0) return 0;
  return resp.value.reduce(
    (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount || 0),
    0
  );
}

async function checkHolding(walletAddress) {
  if (!walletAddress) return { qualifies: false, valueInSol: 0, error: "no wallet" };
  try {
    const [balance, price] = await Promise.all([
      getTokenBalance(walletAddress),
      getTokenPriceInSol(),
    ]);
    const valueInSol = balance * price;
    return { qualifies: valueInSol >= MIN_HOLDING_SOL_NUM, valueInSol, error: null };
  } catch (e) {
    return { qualifies: false, valueInSol: 0, error: e.message };
  }
}

/**
 * Takes a score-sorted candidate list, verifies each one's CURRENT
 * holding in parallel, and returns only the qualifying ones (still in
 * score order) up to maxWinners. A disqualified candidate is simply
 * skipped — the next qualifying candidate is promoted to fill that
 * rank, exactly as if the disqualified score had never been posted.
 */
async function verifyAndFilterHolding(candidates, maxWinners) {
  const checked = await Promise.all(
    candidates.map(async (c) => ({ ...c, holding: await checkHolding(c.wallet) }))
  );
  return checked.filter((c) => c.holding.qualifies).slice(0, maxWinners);
}

// ----------------------------------------------------------------
// Round management
// ----------------------------------------------------------------
async function ensureRoundExists() {
  const roundRef = db.collection("config").doc("round");
  const snap = await roundRef.get();
  if (!snap.exists) {
    await startNewRound(roundRef);
  }
  return roundRef;
}

async function startNewRound(roundRef) {
  const roundId = String(Date.now());
  const now = Date.now();
  await roundRef.set({
    roundId,
    startedAt: admin.firestore.Timestamp.fromMillis(now),
    endsAt: admin.firestore.Timestamp.fromMillis(now + ROUND_MS),
  });
  console.log(`[round] Started new round ${roundId}, ends in ${ROUND_MS / 60000} min.`);
  return roundId;
}

/**
 * Fetches up to `limitCount` entries for a round from the given
 * collection, sorted by score descending. We fetch more than just the
 * top 3 so there's a pool of candidates to fall back through if some
 * top scorers fail the holding check.
 */
async function getRankings(collectionName, roundId, limitCount = 20) {
  const snap = await db
    .collection(collectionName)
    .where("roundId", "==", roundId)
    .orderBy("score", "desc")
    .limit(limitCount)
    .get();
  return snap.docs.map((d) => d.data());
}

async function getWinnersBoardCount() {
  const snap = await db.collection("winnersBoard").count().get();
  return snap.data().count;
}

/**
 * Inducts a player into the Hall of Fame — sets the flag on their user
 * doc and adds them to the winnersBoard roster collection. From this
 * point on, the frontend routes their future scores into the separate
 * winnersBoardScores pool instead of the general leaderboard.
 */
async function inductIntoHallOfFame(winner, roundId) {
  await db.collection("users").doc(winner.uid).set(
    { isWinner: true, inductedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await db.collection("winnersBoard").doc(winner.uid).set({
    uid: winner.uid,
    username: winner.username || "anon",
    wallet: winner.wallet,
    inductedAt: FieldValue.serverTimestamp(),
    inductedScore: winner.score,
    inductedRoundId: roundId,
  });
  console.log(`[round] ${winner.username} inducted into the Hall of Fame.`);
}

/**
 * Main round-processing tick. See the top-of-file comment for the
 * full payout rules this implements.
 */
async function processRoundIfExpired() {
  const roundRef = await ensureRoundExists();
  const roundSnap = await roundRef.get();
  const round = roundSnap.data();

  const endsAtMs = round.endsAt.toMillis();
  if (Date.now() < endsAtMs) return; // round still active

  console.log(`[round] Round ${round.roundId} has ended. Processing...`);

  const { lamports: potLamports } = await updatePotDisplay();

  if (potLamports < MIN_PAYOUT_LAMPORTS) {
    console.log(`[round] Pot below minimum payout threshold. Rolling round without payout.`);
    await startNewRound(roundRef);
    return;
  }

  // Reserve a small buffer for transaction fees
  const feeBuffer = Math.floor(0.001 * LAMPORTS_PER_SOL);
  const usable = Math.max(potLamports - feeBuffer, 0);

  // Team's 20% — ALWAYS taken first, unconditionally. Not part of any
  // other calculation below.
  const teamCutLamports = Math.floor(usable * 0.2);
  const distributableLamports = usable - teamCutLamports; // D = 80%

  if (teamCutLamports > 0) {
    try {
      const feeSig = await sendPayout(feePublicKey.toBase58(), teamCutLamports);
      await db.collection("internal_fee_transfers").add({
        amountSol: teamCutLamports / LAMPORTS_PER_SOL,
        txSignature: feeSig,
        roundId: round.roundId,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`[round] Team cut: ${teamCutLamports / LAMPORTS_PER_SOL} SOL`);
    } catch (err) {
      console.error("[round] Team cut transfer failed — aborting this round's processing, will retry:", err);
      return; // don't pay winners if the team cut didn't go through
    }
  }

  let remainingLamports = distributableLamports;

  // ── Regular round: rank, verify holding, pay ──────────────────
  const rawRankings = await getRankings("roundScores", round.roundId);
  const verifiedTop3 = await verifyAndFilterHolding(rawRankings, 3);

  const useFixed = distributableLamports >= FIXED_TOTAL_LAMPORTS;
  console.log(
    `[round] Distributable: ${distributableLamports / LAMPORTS_PER_SOL} SOL — ` +
    `using ${useFixed ? "FIXED" : "FALLBACK 50/30/20"} payout mode.`
  );

  const regularPayoutRecords = [];

  for (let i = 0; i < verifiedTop3.length; i++) {
    const winner = verifiedTop3[i];
    const shareLamports = useFixed
      ? FIXED_LAMPORTS[i]
      : Math.floor(distributableLamports * FALLBACK_SHARES[i]);

    if (shareLamports <= 0 || shareLamports > remainingLamports || !winner.wallet) continue;

    try {
      const sig = await sendPayout(winner.wallet, shareLamports);
      remainingLamports -= shareLamports;
      regularPayoutRecords.push({
        username: winner.username || "anon",
        wallet: winner.wallet,
        score: winner.score,
        rank: i + 1,
        amountSol: shareLamports / LAMPORTS_PER_SOL,
        txSignature: sig,
        roundId: round.roundId,
        category: "regular",
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`[round] Paid rank ${i + 1} (${winner.username}): ${shareLamports / LAMPORTS_PER_SOL} SOL`);

      // Only the outright #1 winner gets inducted
      if (i === 0) {
        await inductIntoHallOfFame(winner, round.roundId);
      }
    } catch (err) {
      console.error(`[round] Regular payout failed for rank ${i + 1} (${winner.username}):`, err);
      // Leave that share unspent — it stays in the pot for next round.
    }
  }

  for (const record of regularPayoutRecords) {
    await db.collection("payouts").add(record);
  }

  if (verifiedTop3.length === 0) {
    console.log("[round] No holding-verified qualifying scores this round. No regular payout.");
  }

  // ── Hall of Fame payout, if unlocked and funds remain ──────────
  const wbCount = await getWinnersBoardCount();
  if (wbCount >= WB_UNLOCK_COUNT && remainingLamports >= WB_REWARD_LAMPORTS) {
    const rawWbRankings = await getRankings("winnersBoardScores", round.roundId);
    const verifiedWbTop1 = await verifyAndFilterHolding(rawWbRankings, 1);

    if (verifiedWbTop1.length > 0) {
      const winner = verifiedWbTop1[0];
      try {
        const sig = await sendPayout(winner.wallet, WB_REWARD_LAMPORTS);
        remainingLamports -= WB_REWARD_LAMPORTS;
        await db.collection("payouts").add({
          username: winner.username || "anon",
          wallet: winner.wallet,
          score: winner.score,
          rank: 1,
          amountSol: WB_REWARD_LAMPORTS / LAMPORTS_PER_SOL,
          txSignature: sig,
          roundId: round.roundId,
          category: "winnersBoard",
          createdAt: FieldValue.serverTimestamp(),
        });
        console.log(`[round] Hall of Fame payout: ${winner.username} — ${WB_REWARD_LAMPORTS / LAMPORTS_PER_SOL} SOL`);
      } catch (err) {
        console.error("[round] Hall of Fame payout failed:", err);
      }
    } else {
      console.log("[round] Hall of Fame unlocked, but no qualifying member played this round.");
    }
  } else if (wbCount < WB_UNLOCK_COUNT) {
    console.log(`[round] Hall of Fame locked (${wbCount}/${WB_UNLOCK_COUNT} inducted).`);
  }

  await updatePotDisplay();
  await startNewRound(roundRef);
}

async function pollLoop() {
  try {
    await updatePotDisplay();
    await processRoundIfExpired();
  } catch (err) {
    console.error("[poll] Error:", err);
  } finally {
    setTimeout(pollLoop, Number(POLL_INTERVAL_MS));
  }
}

// ----------------------------------------------------------------
// Minimal HTTP server (Railway requires a listening port)
// ----------------------------------------------------------------
const app = express();

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "dino-payout-backend" });
});

app.get("/health", async (req, res) => {
  try {
    const { totalSol } = await updatePotDisplay();
    res.json({ status: "ok", potSol: totalSol });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.listen(Number(PORT), () => {
  console.log(`[server] Listening on port ${PORT}`);
  startAutoClaimFees(connection, potKeypair, console.log);
  pollLoop();
});

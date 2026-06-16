/**
 * DINO — Payout Backend (Round-based, Top-3 split)
 * --------------------------------------------------------------
 * Deploy this to Railway.
 *
 * RULES IMPLEMENTED:
 *  - The game runs in 15-minute rounds (ROUND_DURATION_MS).
 *  - During a round, a player's score only counts toward that round's
 *    ranking if it BEATS their own all-time personal best (recorded by
 *    the frontend into Firestore "roundScores" — see src/pages/Play.jsx).
 *  - When a round's timer expires:
 *      - Rank round-eligible scores, highest first.
 *      - Pay 1st = 50%, 2nd = 30%, 3rd = 20% of the VISIBLE pot (80% of
 *        the real balance) to however many ranks have a qualifying
 *        player.
 *      - Unclaimed ranks (e.g. only 1 or 2 people qualified) are simply
 *        NOT paid — that SOL stays in the pot wallet and rolls into the
 *        next round automatically (we never re-pay previous winners).
 *      - If ZERO players qualified, nothing is paid at all; the full
 *        pot rolls over.
 *  - The remaining 20% of the REAL balance (the part never shown on the
 *    frontend) is skimmed to FEE_WALLET_ADDRESS every time a payout
 *    happens (proportional to whatever was actually distributed this
 *    round, never on rollover rounds where nothing was paid).
 *  - A new round always starts immediately after processing, whether or
 *    not a payout occurred.
 *
 * Required environment variables (Railway):
 *  - FIREBASE_SERVICE_ACCOUNT  -> full JSON (single-line string) of a
 *                                 Firebase service account key
 *  - SOLANA_RPC_URL            -> e.g. https://api.mainnet-beta.solana.com
 *  - POT_WALLET_PRIVATE_KEY    -> base58 secret key of the pot wallet
 *  - POT_WALLET_ADDRESS        -> public address of the pot wallet
 *  - FEE_WALLET_ADDRESS        -> wallet that silently receives ~20% of
 *                                 every round's real payout
 *  - POT_SHARE_PERCENT         -> optional, default 80 (visible/payable share)
 *  - ROUND_DURATION_MS         -> optional, default 900000 (15 minutes)
 *  - POLL_INTERVAL_MS          -> optional, default 15000 (15s)
 *  - MIN_PAYOUT_SOL            -> optional, default 0.01 — below this,
 *                                 a round still ends/restarts but no
 *                                 transfer is attempted
 *  - PORT                      -> optional, default 3000
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
  POT_SHARE_PERCENT = "80",
  ROUND_DURATION_MS = String(15 * 60 * 1000),
  POLL_INTERVAL_MS = "15000",
  MIN_PAYOUT_SOL = "0.01",
  PORT = "3000",
} = process.env;

const POT_SHARE = Number(POT_SHARE_PERCENT) / 100; // e.g. 0.8
const ROUND_MS = Number(ROUND_DURATION_MS);
const MIN_PAYOUT_LAMPORTS = Math.floor(Number(MIN_PAYOUT_SOL) * LAMPORTS_PER_SOL);

// Rank split of the visible (80%) pot
const RANK_SHARES = [0.5, 0.3, 0.2]; // 1st, 2nd, 3rd

if (!FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
}
if (!POT_WALLET_PRIVATE_KEY || !POT_WALLET_ADDRESS || !FEE_WALLET_ADDRESS) {
  throw new Error(
    "Missing one of POT_WALLET_PRIVATE_KEY / POT_WALLET_ADDRESS / FEE_WALLET_ADDRESS"
  );
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

if (potKeypair.publicKey.toBase58() !== potPublicKey.toBase58()) {
  throw new Error("POT_WALLET_PRIVATE_KEY does not match POT_WALLET_ADDRESS");
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
let lastKnownLamports = null;

async function getPotBalanceLamports() {
  return connection.getBalance(potPublicKey);
}

async function updatePotDisplay() {
  const lamports = await getPotBalanceLamports();
  const totalSol = lamports / LAMPORTS_PER_SOL;

  // Inflow watcher — since POT_WALLET_ADDRESS is the same wallet that
  // receives pump.fun creator rewards directly, any balance increase
  // we see here (outside of our own payout transfers) IS a creator
  // reward landing. This replaces the need for a separate bonding-curve
  // monitor: we already have the real, authoritative balance.
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

/**
 * Ensures a round document exists. If none exists yet, starts the
 * very first round.
 */
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
 * Fetches every roundScores entry for the given roundId, returns them
 * sorted by score descending.
 */
async function getRoundRankings(roundId) {
  const snap = await db
    .collection("roundScores")
    .where("roundId", "==", roundId)
    .get();

  const entries = snap.docs.map((d) => d.data());
  entries.sort((a, b) => (b.score || 0) - (a.score || 0));
  return entries;
}

/**
 * Main round-processing tick. If the current round has expired, ranks
 * the round-eligible scores, pays out 1st/2nd/3rd from whatever ranks
 * have a qualifying player, skims the fee wallet proportionally, and
 * starts a fresh round.
 */
async function processRoundIfExpired() {
  const roundRef = await ensureRoundExists();
  const roundSnap = await roundRef.get();
  const round = roundSnap.data();

  const endsAtMs = round.endsAt.toMillis();
  if (Date.now() < endsAtMs) return; // round still active

  console.log(`[round] Round ${round.roundId} has ended. Processing payout...`);

  const rankings = await getRoundRankings(round.roundId);
  const top3 = rankings.slice(0, 3);

  if (top3.length === 0) {
    console.log("[round] No qualifying scores this round. Pot rolls over — no payout.");
    await startNewRound(roundRef);
    return;
  }

  const { lamports: potLamports, totalSol: potSol } = await updatePotDisplay();

  if (potLamports < MIN_PAYOUT_LAMPORTS) {
    console.log(`[round] Pot (${potSol} SOL) below minimum payout threshold. Rolling round without payout.`);
    await startNewRound(roundRef);
    return;
  }

  // Reserve a small buffer for transaction fees
  const feeBuffer = Math.floor(0.001 * LAMPORTS_PER_SOL);
  const visibleLamports = Math.floor((potLamports - feeBuffer) * POT_SHARE);

  let totalPaidLamports = 0;
  const payoutRecords = [];

  for (let i = 0; i < top3.length; i++) {
    const winner = top3[i];
    const shareLamports = Math.floor(visibleLamports * RANK_SHARES[i]);
    if (shareLamports <= 0 || !winner.wallet) continue;

    try {
      const sig = await sendPayout(winner.wallet, shareLamports);
      totalPaidLamports += shareLamports;
      payoutRecords.push({
        username: winner.username || "anon",
        wallet: winner.wallet,
        score: winner.score,
        rank: i + 1,
        amountSol: shareLamports / LAMPORTS_PER_SOL,
        txSignature: sig,
        roundId: round.roundId,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `[round] Paid rank ${i + 1} (${winner.username}, score ${winner.score}): ${shareLamports / LAMPORTS_PER_SOL} SOL`
      );
    } catch (err) {
      console.error(`[round] Payout failed for rank ${i + 1} (${winner.username}):`, err);
      // Skip recording this rank; leave the SOL in the pot — it will
      // simply remain in the balance and roll into the next round.
    }
  }

  // Silent 20% fee skim — proportional to what was ACTUALLY paid out
  // this round (not on rollover rounds, and not on unclaimed ranks).
  if (totalPaidLamports > 0) {
    const feeLamports = Math.floor((totalPaidLamports / POT_SHARE) * (1 - POT_SHARE));
    try {
      const feeSig = await sendPayout(feePublicKey.toBase58(), feeLamports);
      await db.collection("internal_fee_transfers").add({
        amountSol: feeLamports / LAMPORTS_PER_SOL,
        txSignature: feeSig,
        roundId: round.roundId,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`[round] Fee wallet skim: ${feeLamports / LAMPORTS_PER_SOL} SOL`);
    } catch (err) {
      console.error("[round] Fee transfer failed:", err);
    }
  }

  // Record winner-facing payouts
  for (const record of payoutRecords) {
    await db.collection("payouts").add(record);
  }

  // Refresh pot display to reflect what's left (unclaimed ranks +
  // remaining real balance roll over naturally since we only spent
  // what was actually paid).
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
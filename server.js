/**
 * DINO — Payout Backend
 * --------------------------------------------------------------
 * Deploy this to Railway.
 *
 * What it does:
 *  1. Polls the Solana creator-rewards (pot) wallet balance and writes
 *     the FULL balance to Firestore at config/pot.totalSol so the
 *     frontend can display the winner's share (80% by default).
 *  2. Polls config/siteRecord (written by the frontend whenever a player
 *     beats the all-time high score).
 *  3. When a NEW unpaid record is detected:
 *       - Sends 80% of the pot to the winner's registered wallet
 *       - Sends the remaining 20% to FEE_WALLET (silently — never shown
 *         on the frontend)
 *       - Writes a doc to payouts/ with the winner's tx signature
 *       - Resets config/pot.totalSol to 0 (pot starts accumulating again)
 *       - Marks config/siteRecord as paid
 *
 * Required environment variables (set these in Railway):
 *  - FIREBASE_SERVICE_ACCOUNT  -> full JSON (as a single-line string) of a
 *                                 Firebase service account key with
 *                                 Firestore access
 *  - SOLANA_RPC_URL            -> e.g. https://api.mainnet-beta.solana.com
 *  - POT_WALLET_PRIVATE_KEY    -> base58-encoded secret key for the wallet
 *                                 that holds creator rewards (the pot).
 *                                 This wallet PAYS OUT, so guard it well.
 *  - POT_WALLET_ADDRESS        -> public address of the pot wallet (used
 *                                 to check its balance)
 *  - FEE_WALLET_ADDRESS        -> the second wallet that always receives
 *                                 the remaining 20% of every payout
 *  - POT_SHARE_PERCENT         -> optional, default 80 (winner's share)
 *  - POLL_INTERVAL_MS          -> optional, default 30000 (30s)
 *  - MIN_PAYOUT_SOL            -> optional, default 0.01 — pots below this
 *                                 amount are not paid out automatically
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
  POLL_INTERVAL_MS = "30000",
  MIN_PAYOUT_SOL = "0.01",
  PORT = "3000",
} = process.env;

const POT_SHARE = Number(POT_SHARE_PERCENT) / 100;
const FEE_SHARE = 1 - POT_SHARE;
const MIN_PAYOUT_LAMPORTS = Math.floor(
  Number(MIN_PAYOUT_SOL) * LAMPORTS_PER_SOL
);

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
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ----------------------------------------------------------------
// Solana
// ----------------------------------------------------------------
const connection = new Connection(SOLANA_RPC_URL, "confirmed");
const potKeypair = Keypair.fromSecretKey(bs58.decode(POT_WALLET_PRIVATE_KEY));
const potPublicKey = new PublicKey(POT_WALLET_ADDRESS);
const feePublicKey = new PublicKey(FEE_WALLET_ADDRESS);

// Sanity check: the keypair must match the configured pot address
if (potKeypair.publicKey.toBase58() !== potPublicKey.toBase58()) {
  throw new Error(
    "POT_WALLET_PRIVATE_KEY does not match POT_WALLET_ADDRESS"
  );
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
async function getPotBalanceLamports() {
  return connection.getBalance(potPublicKey);
}

async function updatePotDisplay() {
  const lamports = await getPotBalanceLamports();
  const totalSol = lamports / LAMPORTS_PER_SOL;
  await db
    .collection("config")
    .doc("pot")
    .set(
      {
        totalSol,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { lamports, totalSol };
}

/**
 * Sends `amountLamports` from the pot wallet to `destination`.
 * Leaves a small buffer for transaction fees.
 */
async function sendPayout(destination, amountLamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: potKeypair.publicKey,
      toPubkey: new PublicKey(destination),
      lamports: amountLamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [
    potKeypair,
  ]);
  return signature;
}

/**
 * Checks config/siteRecord for an unpaid new high score, and if found
 * (and the pot is above the minimum threshold), pays out:
 *  - POT_SHARE (default 80%) to the winner's wallet
 *  - FEE_SHARE (default 20%) to FEE_WALLET, silently
 * then records the payout and resets the pot.
 */
async function checkAndProcessPayout() {
  const recordRef = db.collection("config").doc("siteRecord");
  const recordSnap = await recordRef.get();

  if (!recordSnap.exists) return;
  const record = recordSnap.data();

  // Already paid, or no winner info, or no wallet on file -> nothing to do
  if (!record || record.paid || !record.wallet || !record.score) return;

  const { lamports: potLamports, totalSol: potSol } = await updatePotDisplay();

  if (potLamports < MIN_PAYOUT_LAMPORTS) {
    console.log(
      `[payout] New record detected but pot (${potSol} SOL) is below minimum payout threshold. Waiting.`
    );
    return;
  }

  // Reserve a small fee buffer (0.001 SOL) so the pot wallet always has
  // enough left to pay transaction fees.
  const feeBuffer = Math.floor(0.001 * LAMPORTS_PER_SOL);
  const distributable = Math.max(potLamports - feeBuffer, 0);

  const winnerLamports = Math.floor(distributable * POT_SHARE);
  const feeLamports = distributable - winnerLamports; // remainder -> fee wallet

  console.log(
    `[payout] New high score by ${record.username} (${record.score}). ` +
      `Paying ${winnerLamports / LAMPORTS_PER_SOL} SOL to winner, ` +
      `${feeLamports / LAMPORTS_PER_SOL} SOL to fee wallet.`
  );

  let winnerSig = null;
  let feeSig = null;

  try {
    if (winnerLamports > 0) {
      winnerSig = await sendPayout(record.wallet, winnerLamports);
    }
    if (feeLamports > 0) {
      feeSig = await sendPayout(feePublicKey.toBase58(), feeLamports);
    }
  } catch (err) {
    console.error("[payout] Transfer failed:", err);
    return; // leave record unpaid so we retry next poll
  }

  // Record the payout (winner-facing only — fee transfer is intentionally
  // not written anywhere the frontend reads from).
  await db.collection("payouts").add({
    username: record.username || "anon",
    wallet: record.wallet,
    score: record.score,
    amountSol: winnerLamports / LAMPORTS_PER_SOL,
    txSignature: winnerSig,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Internal-only log of the fee transfer (not exposed via Firestore reads
  // used by the frontend)
  await db.collection("internal_fee_transfers").add({
    amountSol: feeLamports / LAMPORTS_PER_SOL,
    txSignature: feeSig,
    relatedScore: record.score,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Mark the record as paid and reset the pot display
  await recordRef.set({ paid: true }, { merge: true });
  await db
    .collection("config")
    .doc("pot")
    .set(
      {
        totalSol: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  console.log("[payout] Done.");
}

async function pollLoop() {
  try {
    await updatePotDisplay();
    await checkAndProcessPayout();
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
  pollLoop();
});

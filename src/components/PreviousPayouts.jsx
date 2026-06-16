import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { solscanTx } from "../lib/config";

export default function PreviousPayouts({ max = 10 }) {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Expect collection "payouts" with fields:
        // { username, amountSol, txSignature, score, createdAt }
        const q = query(
          collection(db, "payouts"),
          orderBy("createdAt", "desc"),
          limit(max)
        );
        const snap = await getDocs(q);
        setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load payouts", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [max]);

  return (
    <section className="panel">
      <div className="panel-title">
        <span>PREVIOUS PAYOUTS</span>
        <span className="sub">LATEST {max}</span>
      </div>

      {loading && <p className="empty-state">LOADING...</p>}

      {!loading && payouts.length === 0 && (
        <p className="empty-state">
          NO PAYOUTS YET. TOP 3 EACH ROUND SPLIT THE POT.
        </p>
      )}

      {!loading &&
        payouts.map((p) => (
          <div className="payout-item" key={p.id}>
            <span
              className={p.txSignature ? "payout-wallet" : ""}
              onClick={() =>
                p.txSignature && window.open(solscanTx(p.txSignature), "_blank")
              }
              title={p.txSignature ? "View transaction on Solscan" : ""}
            >
              {p.rank && <span className="rank-badge">#{p.rank}</span>}{" "}
              {p.username?.toUpperCase() || "ANON"} — SCORE{" "}
              {String(p.score || 0).padStart(5, "0")}
            </span>
            <span className="payout-amount">
              {(p.amountSol ?? 0).toFixed(2)} SOL
            </span>
          </div>
        ))}
    </section>
  );
}

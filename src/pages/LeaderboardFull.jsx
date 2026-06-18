import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { solscanTx } from "../lib/config";

export default function LeaderboardFull() {
  const [players, setPlayers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [roundId, setRoundId] = useState(null);
  const { user } = useAuth();

  // Track the active round — rankings reset every round
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "round"), (snap) => {
      setRoundId(snap.exists() ? snap.data().roundId : null);
    });
    return unsub;
  }, []);

  // Live ranking for the current round (general pool — Hall of Fame
  // members compete separately, see the Winners Board page).
  useEffect(() => {
    if (!roundId) {
      setPlayers([]);
      setLoadingPlayers(false);
      return;
    }
    setLoadingPlayers(true);
    const q = query(
      collection(db, "roundScores"),
      where("roundId", "==", roundId),
      orderBy("score", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingPlayers(false);
      },
      (err) => {
        console.error("Failed to load leaderboard", err);
        setLoadingPlayers(false);
      }
    );
    return unsub;
  }, [roundId]);

  useEffect(() => {
    const loadPayouts = async () => {
      try {
        const q = query(
          collection(db, "payouts"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        const snap = await getDocs(q);
        setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load payouts", e);
      } finally {
        setLoadingPayouts(false);
      }
    };
    loadPayouts();
  }, []);

  return (
    <div>
      <section className="panel">
        <div className="panel-title">
          <span>FULL LEADERBOARD</span>
          <span className="sub">THIS ROUND — RESETS EVERY 15 MIN</span>
        </div>
      </section>

      <div className="lb-columns">
        <section className="panel lb-column">
          <div className="panel-title">
            <span>RANKINGS</span>
          </div>

          {loadingPlayers && <p className="empty-state">LOADING...</p>}

          {!loadingPlayers && players.length === 0 && (
            <p className="empty-state">NO SCORES YET THIS ROUND.</p>
          )}

          {!loadingPlayers && players.length > 0 && (
            <div className="lb-scroll">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th className="lb-rank">#</th>
                    <th>PLAYER</th>
                    <th>SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.id} className={p.uid === user?.uid ? "you" : ""}>
                      <td className="lb-rank">{i + 1}</td>
                      <td>{p.username?.toUpperCase() || "ANON"}</td>
                      <td>{String(p.score || 0).padStart(5, "0")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel lb-column">
          <div className="panel-title">
            <span>PAYOUTS</span>
          </div>

          {loadingPayouts && <p className="empty-state">LOADING...</p>}

          {!loadingPayouts && payouts.length === 0 && (
            <p className="empty-state">NO PAYOUTS YET.</p>
          )}

          {!loadingPayouts &&
            payouts.map((p) => (
              <div className="payout-item" key={p.id}>
                <span
                  className={p.txSignature ? "payout-wallet" : ""}
                  onClick={() =>
                    p.txSignature &&
                    window.open(solscanTx(p.txSignature), "_blank")
                  }
                  title={p.txSignature ? "View transaction on Solscan" : ""}
                >
                  {p.category === "winnersBoard" ? (
                    <span className="rank-badge">HOF</span>
                  ) : (
                    p.rank && <span className="rank-badge">#{p.rank}</span>
                  )}{" "}
                  {p.username?.toUpperCase() || "ANON"}
                </span>
                <span className="payout-amount">
                  {(p.amountSol ?? 0).toFixed(2)} SOL
                </span>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { solscanTx } from "../lib/config";

export default function LeaderboardFull() {
  const [players, setPlayers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        // Every user who has ever played, ranked by their personal best
        // (highScore). Players who never set a score are excluded.
        const q = query(
          collection(db, "users"),
          orderBy("highScore", "desc"),
          limit(500)
        );
        const snap = await getDocs(q);
        setPlayers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => (p.gamesPlayed || 0) > 0)
        );
      } catch (e) {
        console.error("Failed to load leaderboard", e);
      } finally {
        setLoadingPlayers(false);
      }
    };

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

    loadPlayers();
    loadPayouts();
  }, []);

  return (
    <div>
      <section className="panel">
        <div className="panel-title">
          <span>FULL LEADERBOARD</span>
          <span className="sub">EVERY PLAYER'S BEST SCORE</span>
        </div>
      </section>

      <div className="lb-columns">
        <section className="panel lb-column">
          <div className="panel-title">
            <span>RANKINGS</span>
          </div>

          {loadingPlayers && <p className="empty-state">LOADING...</p>}

          {!loadingPlayers && players.length === 0 && (
            <p className="empty-state">NO ONE HAS PLAYED YET.</p>
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
                    <tr key={p.id} className={p.id === user?.uid ? "you" : ""}>
                      <td className="lb-rank">{i + 1}</td>
                      <td>{p.username?.toUpperCase() || "ANON"}</td>
                      <td>{String(p.highScore || 0).padStart(5, "0")}</td>
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
                  {p.rank && <span className="rank-badge">#{p.rank}</span>}{" "}
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

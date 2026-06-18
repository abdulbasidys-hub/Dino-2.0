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
import { SITE_CONFIG } from "../lib/config";

export default function WinnersBoard() {
  const { user } = useAuth();
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [roundId, setRoundId] = useState(null);
  const [roundScores, setRoundScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(true);

  const unlockCount = SITE_CONFIG.winnersBoardUnlockCount;
  const isUnlocked = roster.length >= unlockCount;

  // All-time Hall of Fame roster — everyone who has ever won round #1
  useEffect(() => {
    const load = async () => {
      try {
        const q = query(
          collection(db, "winnersBoard"),
          orderBy("inductedAt", "asc"),
          limit(200)
        );
        const snap = await getDocs(q);
        setRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load Hall of Fame roster", e);
      } finally {
        setLoadingRoster(false);
      }
    };
    load();
  }, []);

  // Track the active round
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "round"), (snap) => {
      setRoundId(snap.exists() ? snap.data().roundId : null);
    });
    return unsub;
  }, []);

  // Live ranking within the Hall of Fame's own pool for this round
  useEffect(() => {
    if (!roundId) {
      setRoundScores([]);
      setLoadingScores(false);
      return;
    }
    setLoadingScores(true);
    const q = query(
      collection(db, "winnersBoardScores"),
      where("roundId", "==", roundId),
      orderBy("score", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRoundScores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingScores(false);
      },
      (err) => {
        console.error("Failed to load Hall of Fame round scores", err);
        setLoadingScores(false);
      }
    );
    return unsub;
  }, [roundId]);

  return (
    <div>
      <section className="panel">
        <div className="panel-title">
          <span>HALL OF FAME</span>
          <span className="sub">WINNERS BOARD</span>
        </div>
        <p style={{ fontSize: "9px", lineHeight: "2" }}>
          EVERY ROUND'S #1 WINNER GETS INDUCTED HERE PERMANENTLY AND NO
          LONGER COMPETES ON THE GENERAL LEADERBOARD. ONCE {unlockCount} PLAYERS
          HAVE BEEN INDUCTED, THIS BOARD STARTS PAYING OUT TOO — ONE WINNER
          PER ROUND, {SITE_CONFIG.winnersBoardRewardSol} SOL, BASED ON WHO
          SCORES HIGHEST AMONG HALL OF FAME MEMBERS THAT ROUND.
        </p>
        <p className="pot-note">
          {isUnlocked
            ? "PAYOUTS ARE ACTIVE."
            : `LOCKED — ${roster.length} / ${unlockCount} INDUCTED. PAYOUTS START ONCE ${unlockCount} PLAYERS HAVE WON A ROUND.`}
        </p>
      </section>

      <div className="lb-columns">
        <section className="panel lb-column">
          <div className="panel-title">
            <span>THIS ROUND</span>
            <span className="sub">{isUnlocked ? "1 WINNER PAID" : "NOT YET ACTIVE"}</span>
          </div>

          {loadingScores && <p className="empty-state">LOADING...</p>}

          {!loadingScores && roundScores.length === 0 && (
            <p className="empty-state">
              NO HALL OF FAME MEMBERS HAVE PLAYED THIS ROUND YET.
            </p>
          )}

          {!loadingScores && roundScores.length > 0 && (
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
                  {roundScores.map((p, i) => (
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
            <span>ALL-TIME ROSTER</span>
          </div>

          {loadingRoster && <p className="empty-state">LOADING...</p>}

          {!loadingRoster && roster.length === 0 && (
            <p className="empty-state">
              NO ONE HAS WON A ROUND YET. BE THE FIRST.
            </p>
          )}

          {!loadingRoster &&
            roster.map((w, i) => (
              <div className="payout-item" key={w.id}>
                <span>
                  <span className="rank-badge">{i + 1}</span>{" "}
                  {w.username?.toUpperCase() || "ANON"}
                </span>
                <span className="payout-amount">
                  {String(w.inductedScore || 0).padStart(5, "0")}
                </span>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}

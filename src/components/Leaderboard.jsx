import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

const MAX_SHOWN = 10;

export default function Leaderboard({ max = MAX_SHOWN }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roundId, setRoundId] = useState(null);
  const { user } = useAuth();

  // Track the active round — the leaderboard resets every round, so
  // we need to know which round's scores to show.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "round"), (snap) => {
      setRoundId(snap.exists() ? snap.data().roundId : null);
    });
    return unsub;
  }, []);

  // Live-updating ranking for the current round only. Hall of Fame
  // members don't appear here — their scores go to a separate pool.
  useEffect(() => {
    if (!roundId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "roundScores"),
      where("roundId", "==", roundId),
      orderBy("score", "desc"),
      limit(max)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load leaderboard", err);
        setLoading(false);
      }
    );
    return unsub;
  }, [roundId, max]);

  return (
    <section className="panel">
      <div className="panel-title">
        <span>LEADERBOARD</span>
        <span className="sub">THIS ROUND — TOP {max}</span>
      </div>

      {loading && <p className="empty-state">LOADING...</p>}

      {!loading && players.length === 0 && (
        <p className="empty-state">
          NO SCORES YET THIS ROUND. BE THE FIRST TO PLAY.
        </p>
      )}

      {!loading && players.length > 0 && (
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

      <div className="btn-row">
        <Link to="/leaderboard">
          <button>FULL LEADERBOARD</button>
        </Link>
        <Link to="/winners">
          <button>HALL OF FAME</button>
        </Link>
      </div>
    </section>
  );
}

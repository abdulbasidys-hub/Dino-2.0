import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

const MAX_SHOWN = 10;

export default function Leaderboard({ max = MAX_SHOWN }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(
          collection(db, "users"),
          orderBy("highScore", "desc"),
          limit(max)
        );
        const snap = await getDocs(q);
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load leaderboard", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [max]);

  return (
    <section className="panel">
      <div className="panel-title">
        <span>LEADERBOARD</span>
        <span className="sub">TOP {max}</span>
      </div>

      {loading && <p className="empty-state">LOADING...</p>}

      {!loading && players.length === 0 && (
        <p className="empty-state">
          NO SCORES YET. BE THE FIRST TO PLAY AND CLAIM THE POT.
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

      <div className="btn-row">
        <Link to="/leaderboard">
          <button>FULL LEADERBOARD</button>
        </Link>
      </div>
    </section>
  );
}

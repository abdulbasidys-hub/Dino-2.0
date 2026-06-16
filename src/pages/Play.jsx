import { useState } from "react";
import { Link } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import DinoGame from "../game/DinoGame";
import RoundTimerBar from "../components/RoundTimerBar";

export default function Play() {
  const { user, profile, refreshProfile } = useAuth();
  const [result, setResult] = useState(null); // { score, isPersonalBest, qualifiedForRound }
  const [saving, setSaving] = useState(false);
  const [liveScore, setLiveScore] = useState(0);

  const handleGameOver = async (score) => {
    if (!user) return;
    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      const current = snap.exists() ? snap.data() : { highScore: 0, gamesPlayed: 0 };
      const priorBest = current.highScore || 0;
      const isPersonalBest = score > priorBest;

      // Always update the player's all-time stats
      await updateDoc(userRef, {
        highScore: Math.max(priorBest, score),
        gamesPlayed: (current.gamesPlayed || 0) + 1,
        lastScore: score,
        lastPlayedAt: serverTimestamp(),
      });

      // Round eligibility: the score only counts toward the current
      // round's pot if it BEATS the player's pre-round all-time best.
      // We record it keyed by the active roundId so the backend can
      // rank round-eligible scores when the 15-minute timer expires.
      let qualifiedForRound = false;
      if (isPersonalBest) {
        const roundSnap = await getDoc(doc(db, "config", "round"));
        const roundId = roundSnap.exists() ? roundSnap.data().roundId : null;

        if (roundId) {
          const entryRef = doc(db, "roundScores", `${roundId}_${user.uid}`);
          const entrySnap = await getDoc(entryRef);
          const existingRoundBest = entrySnap.exists() ? entrySnap.data().score || 0 : 0;

          // Only write if this beats whatever they already logged this round
          if (score > existingRoundBest) {
            await setDoc(entryRef, {
              roundId,
              uid: user.uid,
              username: profile?.username || "anon",
              wallet: profile?.wallet || "",
              score,
              priorBest, // the personal best this score had to beat
              achievedAt: serverTimestamp(),
            });
            qualifiedForRound = true;
          }
        }
      }

      await refreshProfile();
      setResult({ score, isPersonalBest, qualifiedForRound });
    } catch (e) {
      console.error("Failed to save score", e);
      setResult({ score, isPersonalBest: false, qualifiedForRound: false, error: true });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <section className="panel">
        <div className="panel-title">
          <span>PLAY</span>
        </div>
        <p className="empty-state">
          YOU NEED AN ACCOUNT TO HAVE YOUR SCORE TRACKED AND TO BE ELIGIBLE
          FOR THE POT.
        </p>
        <div className="btn-row">
          <Link to="/register">
            <button className="btn-primary">CREATE ACCOUNT</button>
          </Link>
          <Link to="/login">
            <button>LOG IN</button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="game-fullbleed">
        <DinoGame onGameOver={handleGameOver} onScoreUpdate={setLiveScore} />
      </div>

      <div className="play-stats-row">
        <div className="play-stat">
          <span className="label">SCORE</span>
          <span className="value">{String(liveScore).padStart(5, "0")}</span>
        </div>
        <RoundTimerBar />
      </div>

      {result && (
        <section className="panel">
          <div className="panel-title">
            <span>RUN COMPLETE</span>
          </div>
          <p style={{ fontSize: "10px", lineHeight: "2" }}>
            SCORE: {String(result.score).padStart(5, "0")}
            <br />
            YOUR BEST: {String(Math.max(profile?.highScore || 0, result.score)).padStart(5, "0")}
            {result.qualifiedForRound && (
              <>
                <br />
                <strong>NEW PERSONAL BEST — YOU'RE IN THIS ROUND'S RANKING!</strong>
                <br />
                IF YOU FINISH IN THE TOP 3 WHEN THE TIMER ENDS, YOU'LL BE
                PAID FROM THE POT AUTOMATICALLY.
              </>
            )}
            {result.error && (
              <>
                <br />
                COULD NOT SAVE SCORE — CHECK YOUR CONNECTION.
              </>
            )}
          </p>
        </section>
      )}

      {saving && <p className="empty-state">SAVING SCORE...</p>}
    </div>
  );
}

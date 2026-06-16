import { useState } from "react";
import { Link } from "react-router-dom";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import DinoGame from "../game/DinoGame";

export default function Play() {
  const { user, profile, refreshProfile } = useAuth();
  const [result, setResult] = useState(null); // { score, isNewHigh, isNewSiteRecord }
  const [saving, setSaving] = useState(false);

  const handleGameOver = async (score) => {
    if (!user) return;
    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      const current = snap.exists() ? snap.data() : { highScore: 0, gamesPlayed: 0 };
      const isPersonalBest = score > (current.highScore || 0);

      await updateDoc(userRef, {
        highScore: Math.max(current.highScore || 0, score),
        gamesPlayed: (current.gamesPlayed || 0) + 1,
        lastScore: score,
        lastPlayedAt: serverTimestamp(),
      });

      // Check if this is a new SITE-WIDE record (potential pot winner)
      let isNewSiteRecord = false;
      const recordRef = doc(db, "config", "siteRecord");
      await runTransaction(db, async (tx) => {
        const recordSnap = await tx.get(recordRef);
        const siteHigh = recordSnap.exists() ? recordSnap.data().score || 0 : 0;
        if (score > siteHigh) {
          isNewSiteRecord = true;
          tx.set(recordRef, {
            score,
            username: profile?.username || "anon",
            uid: user.uid,
            wallet: profile?.wallet || "",
            achievedAt: serverTimestamp(),
          });
        }
      });

      await refreshProfile();
      setResult({ score, isPersonalBest, isNewSiteRecord });
    } catch (e) {
      console.error("Failed to save score", e);
      setResult({ score, isPersonalBest: false, isNewSiteRecord: false, error: true });
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
        <DinoGame onGameOver={handleGameOver} />
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
            {result.isNewSiteRecord && (
              <>
                <br />
                <strong>NEW ALL-TIME HIGH SCORE!</strong>
                <br />
                YOU'VE WON THE POT. PAYOUT WILL BE SENT TO YOUR REGISTERED
                WALLET SHORTLY.
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
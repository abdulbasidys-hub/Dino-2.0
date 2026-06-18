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
import { checkTokenHolding } from "../lib/solanaCheck";
import { SITE_CONFIG } from "../lib/config";
import DinoGame from "../game/DinoGame";
import RoundTimerBar from "../components/RoundTimerBar";

const GUEST_CHOICE_KEY = "dino_play_as_guest";

export default function Play() {
  const { user, profile, refreshProfile } = useAuth();
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [liveScore, setLiveScore] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [guestChosen, setGuestChosen] = useState(
    () => localStorage.getItem(GUEST_CHOICE_KEY) === "1"
  );

  const chooseGuest = () => {
    localStorage.setItem(GUEST_CHOICE_KEY, "1");
    setGuestChosen(true);
  };

  const handleGameOver = async (score) => {
    // Guests can play — their score just doesn't save
    if (!user) {
      setResult({ score, isGuest: true });
      return;
    }
    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      const current = snap.exists()
        ? snap.data()
        : { highScore: 0, gamesPlayed: 0, isWinner: false };
      const priorBest = current.highScore || 0;
      const isPersonalBest = score > priorBest;
      const isWinner = !!current.isWinner;
      const wallet = current.wallet || profile?.wallet || "";

      // Personal stats are tracked unconditionally — these are purely
      // informational now and have no bearing on round ranking.
      await updateDoc(userRef, {
        highScore: Math.max(priorBest, score),
        gamesPlayed: (current.gamesPlayed || 0) + 1,
        lastScore: score,
        lastPlayedAt: serverTimestamp(),
      });

      let qualifiedForRound = false;
      let holdingError = null;

      // Live token-holding check — set HOLDING_GATE_ENABLED to true
      // once your token has a SOL-quoted pair on DexScreener.
      const HOLDING_GATE_ENABLED = true;
      const holding = HOLDING_GATE_ENABLED
        ? await checkTokenHolding(wallet)
        : { qualifies: true, error: null };

      if (!holding.qualifies) {
        holdingError =
          holding.error ||
          `MUST HOLD AT LEAST ${SITE_CONFIG.minHoldingSol} SOL WORTH OF ${SITE_CONFIG.tokenTicker} TO COMPETE.`;
      } else {
        const roundSnap = await getDoc(doc(db, "config", "round"));
        const roundId = roundSnap.exists() ? roundSnap.data().roundId : null;

        if (roundId) {
          // Hall of Fame members compete in their own separate pool —
          // the leaderboard resets every round for everyone, but
          // winners no longer rank on the general board.
          const collectionName = isWinner ? "winnersBoardScores" : "roundScores";
          const entryRef = doc(db, collectionName, `${roundId}_${user.uid}`);
          const entrySnap = await getDoc(entryRef);
          const existingRoundBest = entrySnap.exists() ? entrySnap.data().score || 0 : 0;

          if (score > existingRoundBest) {
            await setDoc(entryRef, {
              roundId,
              uid: user.uid,
              username: profile?.username || "anon",
              wallet,
              score,
              achievedAt: serverTimestamp(),
            });
            qualifiedForRound = true;
          }
        }
      }

      await refreshProfile();
      setResult({ score, isPersonalBest, qualifiedForRound, isWinner, holdingError });
    } catch (e) {
      console.error("Failed to save score", e);
      setResult({ score, isPersonalBest: false, qualifiedForRound: false, error: true });
    } finally {
      setSaving(false);
    }
  };

  if (!user && !guestChosen) {
    return (
      <section className="panel">
        <div className="panel-title"><span>PLAY DINO</span></div>
        <p className="empty-state">
          LOG IN TO TRACK YOUR SCORES AND BE ELIGIBLE FOR THE POT, OR JUMP
          STRAIGHT IN AS A GUEST (GUEST SCORES AREN'T SAVED).
        </p>
        <div className="btn-row">
          <Link to="/login"><button className="btn-primary">LOG IN</button></Link>
          <button onClick={chooseGuest}>PLAY AS GUEST</button>
        </div>
      </section>
    );
  }

  return (
    <div>
      {/* Game takes over the full screen when immersive */}
      <div className={immersive ? "game-immersive-wrap" : "game-fullbleed"}>
        <DinoGame
          onGameOver={handleGameOver}
          onScoreUpdate={setLiveScore}
          onImmersiveChange={setImmersive}
        />
      </div>

      {/* Below-canvas stats only visible when NOT immersive */}
      {!immersive && (
        <>
          <div className="play-stats-row">
            <div className="play-stat">
              <span className="label">SCORE</span>
              <span className="value">{String(liveScore).padStart(5, "0")}</span>
            </div>
            <RoundTimerBar />
          </div>

          {result && result.isGuest && (
            <section className="panel">
              <div className="panel-title"><span>NICE RUN</span></div>
              <p style={{ fontSize: "10px", lineHeight: "2" }}>
                SCORE: {String(result.score).padStart(5, "0")}
                <br />
                PLAYING AS GUEST — YOUR SCORE WAS NOT SAVED.
                <br />
                CREATE AN ACCOUNT TO TRACK YOUR SCORES AND WIN FROM THE POT.
              </p>
              <div className="btn-row">
                <Link to="/register"><button className="btn-primary">CREATE ACCOUNT</button></Link>
                <Link to="/login"><button>LOG IN</button></Link>
              </div>
            </section>
          )}

          {result && !result.isGuest && (
            <section className="panel">
              <div className="panel-title"><span>RUN COMPLETE</span></div>
              <p style={{ fontSize: "10px", lineHeight: "2" }}>
                SCORE: {String(result.score).padStart(5, "0")}
                <br />
                YOUR ALL-TIME BEST: {String(Math.max(profile?.highScore || 0, result.score)).padStart(5, "0")}
                {" "}(PERSONAL STAT ONLY — DOESN'T AFFECT RANKING)
                {result.isWinner && (
                  <>
                    <br />
                    <strong>YOU'RE IN THE HALL OF FAME</strong> — THIS SCORE
                    COMPETES IN THE WINNERS BOARD, NOT THE GENERAL LEADERBOARD.
                  </>
                )}
                {result.holdingError && (
                  <>
                    <br />
                    <strong>SCORE NOT COUNTED:</strong> {result.holdingError}
                  </>
                )}
                {!result.holdingError && result.qualifiedForRound && (
                  <>
                    <br />
                    <strong>YOU'RE ON THE BOARD THIS ROUND!</strong>
                    <br />
                    TOP {result.isWinner ? "1" : "3"} WHEN THE TIMER ENDS GET
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
        </>
      )}
    </div>
  );
}
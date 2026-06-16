import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

function formatRemaining(ms) {
  if (ms === null || ms <= 0) return "--:--";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RoundTimerBar({ className = "" }) {
  const [endsAt, setEndsAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "round"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEndsAt(data.endsAt?.toMillis ? data.endsAt.toMillis() : null);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = endsAt ? endsAt - now : null;
  const isEnding = remaining !== null && remaining <= 60000; // last minute

  return (
    <div className={`round-bar ${isEnding ? "round-bar-urgent" : ""} ${className}`}>
      <span className="round-bar-label">ROUND ENDS</span>
      <span className="round-bar-time">{formatRemaining(remaining)}</span>
    </div>
  );
}

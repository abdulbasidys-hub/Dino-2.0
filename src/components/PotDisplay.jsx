import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { SITE_CONFIG } from "../lib/config";

export default function PotDisplay() {
  const [potSol, setPotSol] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Expect a document at config/pot with field { totalSol: number, updatedAt }
    // totalSol holds the FULL accumulated creator-reward balance. The UI
    // only ever shows the winner's share (potSharePercent of it).
    const unsub = onSnapshot(doc(db, "config", "pot"), (snap) => {
      if (snap.exists()) {
        setPotSol(snap.data().totalSol ?? 0);
      } else {
        setPotSol(0);
      }
    });
    return unsub;
  }, []);

  const visiblePot =
    potSol === null ? null : (potSol * SITE_CONFIG.potSharePercent) / 100;

  const handleCopy = () => {
    navigator.clipboard.writeText(SITE_CONFIG.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="panel">
      <div className="panel-title">
        <span>CURRENT POT</span>
        <span className="sub">UPDATES LIVE</span>
      </div>
      <div className="pot-row">
        <div>
          <div className="pot-value">
            {visiblePot === null ? "-- SOL" : `${visiblePot.toFixed(2)} SOL`}
          </div>
        </div>
      </div>
      <p className="pot-note">
        TOP 3 EACH ROUND GET PAID {SITE_CONFIG.fixedFirstSol} / {SITE_CONFIG.fixedSecondSol} / {SITE_CONFIG.fixedThirdSol} SOL
        WHEN THE POT CAN COVER IT — OTHERWISE THE POT SPLITS 50/30/20
        INSTEAD. MUST HOLD 200,000+ {SITE_CONFIG.tokenTicker} TO QUALIFY.
      </p>
      <div className="ca-row">
        <span title={SITE_CONFIG.contractAddress}>
          CA: {SITE_CONFIG.contractAddress}
        </span>
        <button onClick={handleCopy}>{copied ? "COPIED" : "COPY"}</button>
      </div>
    </section>
  );
}
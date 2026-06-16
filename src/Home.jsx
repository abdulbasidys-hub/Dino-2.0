import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PotDisplay from "../components/PotDisplay";
import Leaderboard from "../components/Leaderboard";
import PreviousPayouts from "../components/PreviousPayouts";
import { SITE_CONFIG } from "../lib/config";

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      <section className="panel">
        <div className="panel-title">
          <span>{SITE_CONFIG.tokenName}</span>
          <span className="sub">{SITE_CONFIG.tokenTicker}</span>
        </div>
        <p style={{ fontSize: "9px", lineHeight: "2" }}>
          PLAY THE DINO RUNNER. EVERY 15 MINUTES (SEE TIMER ABOVE), THE
          TOP 3 PLAYERS WHO BEAT THEIR OWN ALL-TIME BEST DURING THAT
          ROUND SPLIT THE POT — 50% / 30% / 20%. NO QUALIFYING SCORE
          MEANS THE POT ROLLS OVER.
        </p>
        <div className="btn-row">
          <Link to="/play">
            <button className="btn-primary">PLAY NOW</button>
          </Link>
          {!user && (
            <Link to="/register">
              <button>CREATE ACCOUNT</button>
            </Link>
          )}
        </div>
      </section>

      <PotDisplay />
      <Leaderboard />
      <PreviousPayouts />
    </div>
  );
}

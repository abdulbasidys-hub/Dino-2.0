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
          PLAY THE DINO RUNNER AND SET A NEW ALL-TIME HIGH SCORE TO WIN THE
          POT. ANY PLAYER WHO BEATS THE CURRENT RECORD TAKES THE ACCUMULATED
          REWARD POOL.
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

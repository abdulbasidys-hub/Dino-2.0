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
          PLAY THE DINO RUNNER. THE LEADERBOARD RESETS EVERY 15-MINUTE
          ROUND — EVERYONE STARTS AT ZERO EACH TIME. TOP 3 EACH ROUND
          GET PAID FROM THE POT. MUST HOLD {SITE_CONFIG.minHoldingSol}+
          SOL WORTH OF {SITE_CONFIG.tokenTicker} TO QUALIFY — WE CHECK
          LIVE, EVERY GAME.
          <br />
          WIN A ROUND AND YOU'RE INDUCTED INTO THE HALL OF FAME — A
          SEPARATE BOARD THAT UNLOCKS ITS OWN PAYOUTS ONCE{" "}
          {SITE_CONFIG.winnersBoardUnlockCount} PLAYERS HAVE WON.
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

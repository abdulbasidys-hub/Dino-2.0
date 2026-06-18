import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SITE_CONFIG } from "../lib/config";
import RoundTimerBar from "./RoundTimerBar";

export default function Topbar() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="topbar">
      <div className="topbar-top-row">
        <Link to="/" className="topbar-logo">
          {SITE_CONFIG.tokenTicker}
        </Link>
        <RoundTimerBar />
      </div>
      <nav className="topbar-nav">
        <Link to="/">HOME</Link>
        <Link to="/play">PLAY</Link>
        <Link to="/leaderboard">LEADERBOARD</Link>
        <Link to="/winners">WINNERS</Link>
        {user ? (
          <>
            <span className="topbar-username">
              {profile?.username?.toUpperCase()}
            </span>
            <button onClick={handleLogout}>LOG OUT</button>
          </>
        ) : (
          <>
            <Link to="/login">LOG IN</Link>
            <Link to="/register">REGISTER</Link>
          </>
        )}
      </nav>
    </header>
  );
}

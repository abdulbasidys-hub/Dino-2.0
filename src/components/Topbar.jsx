import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SITE_CONFIG } from "../lib/config";

export default function Topbar() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo">
        {SITE_CONFIG.tokenTicker}
      </Link>
      <nav className="topbar-nav">
        <Link to="/">HOME</Link>
        <Link to="/play">PLAY</Link>
        <Link to="/leaderboard">LEADERBOARD</Link>
        {user ? (
          <>
            <span style={{ fontSize: "10px", padding: "8px 0" }}>
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

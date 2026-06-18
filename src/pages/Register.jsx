import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SITE_CONFIG } from "../lib/config";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await register(username, password, wallet);
      navigate("/play");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-title">
        <span>CREATE ACCOUNT</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <label className="field-label">USERNAME</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="dino_runner"
            required
            maxLength={16}
          />
          <p className="field-hint">
            3-16 CHARACTERS. LETTERS, NUMBERS, UNDERSCORE.
          </p>
        </div>

        <div>
          <label className="field-label">PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="field-label">CONFIRM PASSWORD</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="field-label">SOLANA WALLET ADDRESS</label>
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Your SOL wallet (for payouts)"
            required
          />
          <p className="field-hint">
            USED TO SEND YOUR WINNINGS. MUST CURRENTLY HOLD AT LEAST
            200,000 {SITE_CONFIG.tokenTicker} TO REGISTER AND TO COMPETE —
            WE VERIFY THIS LIVE, INCLUDING EVERY TIME YOU FINISH A GAME.
          </p>
        </div>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "VERIFYING WALLET..." : "CREATE ACCOUNT"}
        </button>
      </form>

      <p className="auth-switch">
        ALREADY HAVE AN ACCOUNT? <Link to="/login">LOG IN</Link>
      </p>
    </section>
  );
}
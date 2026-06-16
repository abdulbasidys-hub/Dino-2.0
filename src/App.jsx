import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Topbar from "./components/Topbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Play from "./pages/Play";
import LeaderboardFull from "./pages/LeaderboardFull";
import { SITE_CONFIG } from "./lib/config";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Topbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/play" element={<Play />} />
              <Route path="/leaderboard" element={<LeaderboardFull />} />
            </Routes>
          </main>
          <footer className="site-footer">
            {SITE_CONFIG.tokenTicker} — NOT FINANCIAL ADVICE. PLAY AT YOUR
            OWN RISK.
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db, usernameToEmail } from "../lib/firebase";
import { checkTokenHolding } from "../lib/solanaCheck";
import { SITE_CONFIG } from "../lib/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const register = async (username, password, wallet) => {
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(cleanUsername)) {
      throw new Error(
        "Username must be 3-16 characters: letters, numbers, underscore only."
      );
    }
    if (!wallet || wallet.trim().length < 32) {
      throw new Error("Enter a valid Solana wallet address.");
    }

    // Token-holding gate — set HOLDING_GATE_ENABLED to true once your
    // token has a SOL-quoted trading pair on DexScreener. Until then,
    // the price lookup will fail and block everyone from registering.
    const HOLDING_GATE_ENABLED = true;

    if (HOLDING_GATE_ENABLED) {
      const holding = await checkTokenHolding(wallet.trim());
      if (!holding.qualifies) {
        if (holding.error) {
          throw new Error(
            `Could not verify token holding (${holding.error}). Please try again in a moment.`
          );
        }
        throw new Error(
          `This wallet must hold at least ${SITE_CONFIG.minHoldingSol} SOL worth of ${SITE_CONFIG.tokenTicker} to register.`
        );
      }
    }

    // Check username availability
    const existing = await getDoc(doc(db, "usernames", cleanUsername));
    if (existing.exists()) {
      throw new Error("That username is already taken.");
    }

    const email = usernameToEmail(cleanUsername);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: cleanUsername });

    const userDoc = {
      username: cleanUsername,
      wallet: wallet.trim(),
      highScore: 0,
      gamesPlayed: 0,
      isWinner: false,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, "users", cred.user.uid), userDoc);
    await setDoc(doc(db, "usernames", cleanUsername), { uid: cred.user.uid });

    setProfile(userDoc);
    return cred.user;
  };

  const login = async (username, password) => {
    const email = usernameToEmail(username.trim().toLowerCase());
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    setProfile(snap.exists() ? snap.data() : null);
    return cred.user;
  };

  const logout = () => signOut(auth);

  const refreshProfile = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    setProfile(snap.exists() ? snap.data() : null);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, register, login, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
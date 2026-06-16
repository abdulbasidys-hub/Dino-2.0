import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBcBsuDEMkbuZCRyDde36h-JSs_lUWX-y4",
  authDomain: "dino-741b5.firebaseapp.com",
  projectId: "dino-741b5",
  storageBucket: "dino-741b5.firebasestorage.app",
  messagingSenderId: "20018129355",
  appId: "1:20018129355:web:f6d27ccb1d0d6f2e49ee4e",
  measurementId: "G-0M5ZXHNB74",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Email domain used to build a fake email from a username.
// Users never see this — it's purely for Firebase Auth's email/password system.
export const EMAIL_DOMAIN = "@dinogame.app";

export const usernameToEmail = (username) =>
  `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;

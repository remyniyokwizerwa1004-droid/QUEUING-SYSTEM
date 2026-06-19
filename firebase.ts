import { initializeApp } from "firebase/app";
// The ESP32 device talks to the Firebase REALTIME DATABASE (RTDB) over REST,
// NOT Cloud Firestore. The web app must use the same RTDB so the dashboard
// actually reads the live device state. Do NOT reintroduce Firestore here.
import {
  getDatabase,
  ref,
  onValue,
  update,
  set,
  runTransaction,
  serverTimestamp,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD4_Ezxs2nMvsudrgNpicEzYd4O4ElSHYA",
  authDomain: "queuing-system-ed24f.firebaseapp.com",
  databaseURL: "https://queuing-system-ed24f-default-rtdb.firebaseio.com",
  projectId: "queuing-system-ed24f",
  storageBucket: "queuing-system-ed24f.firebasestorage.app",
  messagingSenderId: "1081543635159",
  appId: "1:1081543635159:web:9ad54558e52e91d56ac092",
};

const app = initializeApp(firebaseConfig);

// Realtime Database handle used by any module-based (Vite + TS) code.
export const db = getDatabase(app);

// Re-export the RTDB helpers so callers import them from one place.
export { ref, onValue, update, set, runTransaction, serverTimestamp };

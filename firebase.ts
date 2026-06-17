import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD4_Ezxs2nMvsudrgNpicEzYd4O4ElSHYA",
  authDomain: "queuing-system-ed24f.firebaseapp.com",
  projectId: "queuing-system-ed24f",
  storageBucket: "queuing-system-ed24f.firebasestorage.app",
  messagingSenderId: "1081543635159",
  appId: "1:1081543635159:web:9ad54558e52e91d56ac092"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

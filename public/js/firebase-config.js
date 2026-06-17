// Web App's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4_Ezxs2nMvsudrgNpicEzYd4O4ElSHYA",
  authDomain: "queuing-system-ed24f.firebaseapp.com",
  databaseURL: "https://queuing-system-ed24f-default-rtdb.firebaseio.com",
  projectId: "queuing-system-ed24f",
  storageBucket: "queuing-system-ed24f.firebasestorage.app",
  messagingSenderId: "1081543635159",
  appId: "1:1081543635159:web:9ad54558e52e91d56ac092",
  measurementId: "G-K37HDMVBPB"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get references to Firebase Services
const database = firebase.database();
const auth = firebase.auth();

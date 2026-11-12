import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhxC-YtYTzDvvc7clufOukgdVUNEvrNj4",
  authDomain: "railway-mitra.firebaseapp.com",
  projectId: "railway-mitra",
  storageBucket: "railway-mitra.firebasestorage.app",
  messagingSenderId: "697258746002",
  appId: "1:697258746002:web:811c2627b8874f7212064b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

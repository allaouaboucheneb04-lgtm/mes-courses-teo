import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBn-OVxiAD5_8ohPKN4CuwqK1tZUIGktwg",
  authDomain: "taxi-budget-7b812.firebaseapp.com",
  projectId: "taxi-budget-7b812",
  storageBucket: "taxi-budget-7b812.firebasestorage.app",
  messagingSenderId: "677308390220",
  appId: "1:677308390220:web:e5107330043cae0b1c0de9",
  measurementId: "G-JN8BDSC5FS",
};

const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });

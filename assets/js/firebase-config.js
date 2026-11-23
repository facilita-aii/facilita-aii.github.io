import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDIHeBjalHcmg2aWoq0I3owktNWbxwa204",
  authDomain: "facilita-ai-9d10b.firebaseapp.com",
  projectId: "facilita-ai-9d10b",
  storageBucket: "facilita-ai-9d10b.firebasestorage.app",
  messagingSenderId: "1071975940649",
  appId: "1:1071975940649:web:c4017544196fe175a69238"
};

try {
  const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  const db = getFirestore(app);

  window.cloud = {
    setService: (id, data) =>
      setDoc(doc(db, "services", id), data),

    onServices: (onOk, onFail) =>
      onSnapshot(collection(db, "services"), onOk, onFail),

    setReview: (id, data) =>
      setDoc(doc(db, "reviews", id), data),

    onReviews: (onOk, onFail) =>
      onSnapshot(collection(db, "reviews"), onOk, onFail)
  };

  console.log("[Facilita ai] Firebase conectado com sucesso!");
} catch (error) {
  window.cloud = null;
  console.error("[Facilita ai] Erro ao conectar Firebase:", error);
}

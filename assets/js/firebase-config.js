// Firebase Config (SDK modular: necessário para usar o banco Firestore nomeado)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseAppConfig = {"projectId":"mimetic-shell-2n50x","appId":"1:250057532401:web:12236172dff9b804225a50","apiKey":"AIzaSyBFQUN4ch-r39hJULe9khITFyB5R3mmZtk","authDomain":"mimetic-shell-2n50x.firebaseapp.com","firestoreDatabaseId":"ai-studio-conectajemergnci-9c02643e-35e9-4095-ae9c-e0af404bc1ab","storageBucket":"mimetic-shell-2n50x.firebasestorage.app","messagingSenderId":"250057532401","measurementId":"","oAuthClientId":"250057532401-2o46243msjmpfegebfvsns1ucjvhu6dv.apps.googleusercontent.com","recaptchaSiteKey":""};

try {
  const app = getApps().length ? getApp() : initializeApp(firebaseAppConfig);
  // Segundo argumento = ID do banco nomeado (o SDK compat ignorava isso e usava o "(default)")
  const db = getFirestore(app, firebaseAppConfig.firestoreDatabaseId);

  window.cloud = {
    setService: function(id, data) { return setDoc(doc(db, 'services', id), data); },
    onServices: function(onOk, onFail) { return onSnapshot(collection(db, 'services'), onOk, onFail); },
    setReview:  function(id, data) { return setDoc(doc(db, 'reviews', id), data); },
    onReviews:  function(onOk, onFail) { return onSnapshot(collection(db, 'reviews'), onOk, onFail); }
  };
  console.log('[Facilita ai] Firestore inicializado (banco: ' + firebaseAppConfig.firestoreDatabaseId + ').');
} catch (e) {
  window.cloud = null;
  console.warn('[Facilita ai] Firestore indisponível:', e);
}
